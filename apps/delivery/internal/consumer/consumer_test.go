package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/sony/gobreaker"

	"github.com/flowmesh/delivery/internal/configclient"
)

// fakeAcker records Ack/Nack calls for assertions.
type fakeAcker struct {
	mu      sync.Mutex
	acked   bool
	nacked  bool
	requeue bool
}

func (a *fakeAcker) Ack(multiple bool) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.acked = true
	return nil
}

func (a *fakeAcker) Nack(multiple, requeue bool) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.nacked = true
	a.requeue = requeue
	return nil
}

func (a *fakeAcker) wasAcked() bool  { a.mu.Lock(); defer a.mu.Unlock(); return a.acked }
func (a *fakeAcker) wasNacked() bool { a.mu.Lock(); defer a.mu.Unlock(); return a.nacked }
func (a *fakeAcker) requeuedOnNack() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.requeue
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func makeBody(workspaceID, destinationID string, event map[string]any) []byte {
	msg := fanoutMessage{
		Meta: fanoutMeta{
			MessageID:     "msg-1",
			ExecutionID:   "exec-1",
			DestinationID: destinationID,
			WorkspaceID:   workspaceID,
		},
		Event: event,
	}
	b, _ := json.Marshal(msg)
	return b
}

func newTestConsumer(cfgURL string) *Consumer {
	return &Consumer{
		configClient: configclient.New(cfgURL),
		breakers:     make(map[string]*gobreaker.CircuitBreaker),
		logger:       testLogger(),
	}
}

func destinationServer(t *testing.T, dest configclient.Destination) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(dest)
	}))
}

// ─── Happy path ──────────────────────────────────────────────────────────────

func TestHandleMessage_Success_Acks(t *testing.T) {
	var mu sync.Mutex
	var delivered map[string]any

	webhookSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		delivered = body
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer webhookSrv.Close()

	cfgSrv := destinationServer(t, configclient.Destination{
		ID:     "dest-1",
		Type:   "webhook",
		Config: map[string]any{"url": webhookSrv.URL},
	})
	defer cfgSrv.Close()

	a := &fakeAcker{}
	c := newTestConsumer(cfgSrv.URL)
	c.handleMessageInternal(context.Background(), a, makeBody("ws-1", "dest-1", map[string]any{"eventId": "evt-1"}))

	if !a.wasAcked() {
		t.Error("expected message to be acked on successful delivery")
	}

	mu.Lock()
	defer mu.Unlock()
	if delivered["eventId"] != "evt-1" {
		t.Errorf("webhook received wrong eventId: %v", delivered["eventId"])
	}
}

// ─── Failure paths ───────────────────────────────────────────────────────────

func TestHandleMessage_UnparseableBody_NacksToDLQ(t *testing.T) {
	a := &fakeAcker{}
	c := newTestConsumer("http://127.0.0.1:1")
	c.handleMessageInternal(context.Background(), a, []byte("not-json"))

	if !a.wasNacked() || a.requeuedOnNack() {
		t.Error("expected nack without requeue on unparseable message")
	}
}

func TestHandleMessage_ConfigClientFails_NacksToDLQ(t *testing.T) {
	cfgSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer cfgSrv.Close()

	a := &fakeAcker{}
	c := newTestConsumer(cfgSrv.URL)
	c.handleMessageInternal(context.Background(), a, makeBody("ws-1", "missing", map[string]any{}))

	if !a.wasNacked() || a.requeuedOnNack() {
		t.Error("expected nack without requeue when destination not found")
	}
}

func TestHandleMessage_UnsupportedDestType_NacksToDLQ(t *testing.T) {
	cfgSrv := destinationServer(t, configclient.Destination{
		ID:     "dest-1",
		Type:   "email",
		Config: map[string]any{},
	})
	defer cfgSrv.Close()

	a := &fakeAcker{}
	c := newTestConsumer(cfgSrv.URL)
	c.handleMessageInternal(context.Background(), a, makeBody("ws-1", "dest-1", map[string]any{}))

	if !a.wasNacked() || a.requeuedOnNack() {
		t.Errorf("expected nack-to-dlq for unsupported destination type, acked=%v nacked=%v requeue=%v",
			a.wasAcked(), a.wasNacked(), a.requeuedOnNack())
	}
}

func TestHandleMessage_Webhook5xx_RetriesAndNacksToDLQ(t *testing.T) {
	attempts := 0
	webhookSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer webhookSrv.Close()

	cfgSrv := destinationServer(t, configclient.Destination{
		ID:     "dest-1",
		Type:   "webhook",
		Config: map[string]any{"url": webhookSrv.URL},
	})
	defer cfgSrv.Close()

	a := &fakeAcker{}
	c := newTestConsumer(cfgSrv.URL)

	// Use a fast-failing breaker so the test doesn't wait for real backoff
	c.breakers["webhook:dest-1"] = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "test",
		ReadyToTrip: func(counts gobreaker.Counts) bool { return false },
	})

	// Override baseDelayMs to zero for the test by running inline with context
	done := make(chan struct{})
	go func() {
		c.handleMessageInternal(context.Background(), a, makeBody("ws-1", "dest-1", map[string]any{}))
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("timeout — handleMessageInternal did not return")
	}

	if !a.wasNacked() || a.requeuedOnNack() {
		t.Error("expected nack-to-dlq after max retries")
	}
	if attempts != maxRetries {
		t.Errorf("expected %d delivery attempts, got %d", maxRetries, attempts)
	}
}

func TestHandleMessage_ContextCancelledDuringBackoff_NacksWithRequeue(t *testing.T) {
	// Webhook always fails — the consumer enters a backoff sleep between retries.
	// We cancel the context shortly after the first failure to interrupt that sleep
	// and verify the consumer nacks with requeue=true (message stays in queue).
	firstAttempt := make(chan struct{}, 1)
	webhookSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		select {
		case firstAttempt <- struct{}{}:
		default:
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer webhookSrv.Close()

	cfgSrv := destinationServer(t, configclient.Destination{
		ID:     "dest-1",
		Type:   "webhook",
		Config: map[string]any{"url": webhookSrv.URL},
	})
	defer cfgSrv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	a := &fakeAcker{}
	c := newTestConsumer(cfgSrv.URL)

	done := make(chan struct{})
	go func() {
		c.handleMessageInternal(ctx, a, makeBody("ws-1", "dest-1", map[string]any{}))
		close(done)
	}()

	// Cancel after first attempt hits the webhook — consumer is now in backoff sleep.
	<-firstAttempt
	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for consumer to exit after context cancellation")
	}

	if !a.wasNacked() {
		t.Error("expected nack on context cancellation")
	}
	if !a.requeuedOnNack() {
		t.Error("expected requeue=true so the message is not lost on shutdown")
	}
}

// ─── Circuit breaker ─────────────────────────────────────────────────────────

func TestBreaker_OpensAfterConsecutiveFailures(t *testing.T) {
	c := &Consumer{
		breakers: make(map[string]*gobreaker.CircuitBreaker),
		logger:   testLogger(),
	}

	cb := c.breakerFor("dest-1", "webhook")

	// Trigger 5 consecutive failures to open the breaker
	for i := 0; i < 5; i++ {
		cb.Execute(func() (any, error) { //nolint:errcheck
			return nil, fmt.Errorf("fail")
		})
	}

	// Next call should fail immediately with circuit open error
	_, err := cb.Execute(func() (any, error) {
		return nil, nil
	})
	if err == nil {
		t.Error("expected circuit breaker to be open, but call succeeded")
	}
}

func TestBreaker_SameDestinationReturnsSameBreaker(t *testing.T) {
	c := &Consumer{
		breakers: make(map[string]*gobreaker.CircuitBreaker),
		logger:   testLogger(),
	}

	cb1 := c.breakerFor("dest-abc", "webhook")
	cb2 := c.breakerFor("dest-abc", "webhook")

	if cb1 != cb2 {
		t.Error("expected same circuit breaker instance for same destination")
	}
}

func TestBreaker_DifferentDestinationsGetDifferentBreakers(t *testing.T) {
	c := &Consumer{
		breakers: make(map[string]*gobreaker.CircuitBreaker),
		logger:   testLogger(),
	}

	cb1 := c.breakerFor("dest-1", "webhook")
	cb2 := c.breakerFor("dest-2", "webhook")

	if cb1 == cb2 {
		t.Error("expected different circuit breakers for different destinations")
	}
}

// ─── Constructor ─────────────────────────────────────────────────────────────

func TestNew_InitialisesBreakersMap(t *testing.T) {
	cfgClient := configclient.New("http://127.0.0.1:1")
	c := New(nil, cfgClient, testLogger())

	if c.breakers == nil {
		t.Error("expected breakers map to be initialised")
	}
	if c.configClient != cfgClient {
		t.Error("expected configClient to be set")
	}
}

// ─── processDelivery ─────────────────────────────────────────────────────────

// fakeAmqpAcknowledger satisfies amqp091's internal acknowledger interface
// so we can create an amqp.Delivery with a controllable ack/nack outcome.
type fakeAmqpAcknowledger struct {
	acked  bool
	nacked bool
	mu     sync.Mutex
}

func (f *fakeAmqpAcknowledger) Ack(tag uint64, multiple bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.acked = true
	return nil
}

func (f *fakeAmqpAcknowledger) Nack(tag uint64, multiple, requeue bool) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nacked = true
	return nil
}

func (f *fakeAmqpAcknowledger) Reject(tag uint64, requeue bool) error { return nil }

func TestProcessDelivery_CallsHandleMessageInternal(t *testing.T) {
	webhookSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer webhookSrv.Close()

	cfgSrv := destinationServer(t, configclient.Destination{
		ID:     "dest-1",
		Type:   "webhook",
		Config: map[string]any{"url": webhookSrv.URL},
	})
	defer cfgSrv.Close()

	c := newTestConsumer(cfgSrv.URL)

	acknowledger := &fakeAmqpAcknowledger{}
	delivery := amqp.Delivery{
		Acknowledger: acknowledger,
		Body:         makeBody("ws-1", "dest-1", map[string]any{"eventId": "evt-proc"}),
	}

	c.processDelivery(context.Background(), &delivery)

	acknowledger.mu.Lock()
	defer acknowledger.mu.Unlock()
	if !acknowledger.acked {
		t.Error("expected delivery to be acked via processDelivery → handleMessageInternal")
	}
}
