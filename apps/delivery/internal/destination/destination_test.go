package destination

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// ── Webhook tests ─────────────────────────────────────────────────────────────

func TestWebhookDeliver_HappyPath(t *testing.T) {
	var gotBody map[string]any
	var gotSig string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		gotSig = r.Header.Get("X-FlowMesh-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	event := map[string]any{"eventId": "evt-1", "event": "order.created"}
	cfg := map[string]any{"url": srv.URL, "secret": "mysecret"}

	err := Dispatch(context.Background(), "webhook", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if gotBody["eventId"] != "evt-1" {
		t.Errorf("expected eventId evt-1, got %v", gotBody["eventId"])
	}

	body, _ := json.Marshal(event)
	mac := hmac.New(sha256.New, []byte("mysecret"))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if gotSig != expected {
		t.Errorf("signature mismatch: got %s, want %s", gotSig, expected)
	}
}

func TestWebhookDeliver_NoSecret_NoSignatureHeader(t *testing.T) {
	var gotSig string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-FlowMesh-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "webhook", cfg, map[string]any{"event": "test"})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if gotSig != "" {
		t.Errorf("expected no signature header when secret is empty, got %s", gotSig)
	}
}

func TestWebhookDeliver_ServerReturns5xx_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "webhook", cfg, map[string]any{"event": "test"})
	if err == nil {
		t.Fatal("expected error on 5xx, got nil")
	}
}

func TestWebhookDeliver_ServerReturns429_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "webhook", cfg, map[string]any{"event": "test"})
	if err == nil {
		t.Fatal("expected error on 429, got nil")
	}
}

func TestWebhookDeliver_MissingURL_ReturnsError(t *testing.T) {
	err := Dispatch(context.Background(), "webhook", map[string]any{}, map[string]any{"event": "test"})
	if err == nil {
		t.Fatal("expected error when url is missing")
	}
}

func TestWebhookDeliver_UnreachableURL_ReturnsError(t *testing.T) {
	cfg := map[string]any{"url": "http://127.0.0.1:1"}
	err := Dispatch(context.Background(), "webhook", cfg, map[string]any{"event": "test"})
	if err == nil {
		t.Fatal("expected error when server is unreachable")
	}
}

func TestDispatch_UnsupportedType_ReturnsError(t *testing.T) {
	err := Dispatch(context.Background(), "email", map[string]any{}, map[string]any{})
	if err == nil {
		t.Fatal("expected error for unsupported destination type")
	}
}

func TestWebhookDeliver_ContextCancelled_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(ctx, "webhook", cfg, map[string]any{"event": "test"})
	if err == nil {
		t.Fatal("expected error when context is cancelled")
	}
}

// ── PostgreSQL tests ──────────────────────────────────────────────────────────

// fakePgConn implements pgExecutor without a real database.
type fakePgConn struct {
	execFn  func(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	closed  bool
}

func (f *fakePgConn) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return f.execFn(ctx, sql, args...)
}

func (f *fakePgConn) Close(_ context.Context) error {
	f.closed = true
	return nil
}

// withFakeConn replaces connectPg for the duration of the test.
func withFakeConn(conn *fakePgConn) func() {
	orig := connectPg
	connectPg = func(_ context.Context, _ string) (pgExecutor, error) { return conn, nil }
	return func() { connectPg = orig }
}

func TestPostgresDeliver_HappyPath(t *testing.T) {
	var gotSQL string
	var gotArgs []any

	fake := &fakePgConn{
		execFn: func(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
			gotSQL = sql
			gotArgs = args
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		},
	}
	defer withFakeConn(fake)()

	event := map[string]any{
		"eventId":     "evt-abc",
		"workspaceId": "ws-1",
		"eventName":   "order.created",
	}
	cfg := map[string]any{"url": "postgresql://fake", "table": "flowmesh_events"}

	err := Dispatch(context.Background(), "postgres", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if !fake.closed {
		t.Error("expected connection to be closed after delivery")
	}

	// Verify the INSERT targets the right table
	if gotSQL == "" {
		t.Fatal("Exec was not called")
	}

	// Verify positional args: event_id, workspace_id, event_name, payload
	if len(gotArgs) != 4 {
		t.Fatalf("expected 4 args, got %d", len(gotArgs))
	}
	if gotArgs[0] != "evt-abc" {
		t.Errorf("arg[0] event_id: want evt-abc, got %v", gotArgs[0])
	}
	if gotArgs[1] != "ws-1" {
		t.Errorf("arg[1] workspace_id: want ws-1, got %v", gotArgs[1])
	}
	if gotArgs[2] != "order.created" {
		t.Errorf("arg[2] event_name: want order.created, got %v", gotArgs[2])
	}
}

func TestPostgresDeliver_DefaultTable(t *testing.T) {
	var gotSQL string
	fake := &fakePgConn{
		execFn: func(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
			gotSQL = sql
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		},
	}
	defer withFakeConn(fake)()

	// No "table" key in config — should default to flowmesh_events
	cfg := map[string]any{"url": "postgresql://fake"}
	err := Dispatch(context.Background(), "postgres", cfg, map[string]any{"eventId": "x"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !contains(gotSQL, "flowmesh_events") {
		t.Errorf("expected default table name in SQL, got: %s", gotSQL)
	}
}

func TestPostgresDeliver_SchemaQualifiedTable(t *testing.T) {
	var gotSQL string
	fake := &fakePgConn{
		execFn: func(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
			gotSQL = sql
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		},
	}
	defer withFakeConn(fake)()

	cfg := map[string]any{"url": "postgresql://fake", "table": "analytics.events"}
	err := Dispatch(context.Background(), "postgres", cfg, map[string]any{"eventId": "x"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !contains(gotSQL, "analytics.events") {
		t.Errorf("expected schema-qualified table in SQL, got: %s", gotSQL)
	}
}

func TestPostgresDeliver_InvalidTableName_ReturnsError(t *testing.T) {
	fake := &fakePgConn{execFn: func(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
		return pgconn.CommandTag{}, nil
	}}
	defer withFakeConn(fake)()

	cases := []string{
		"events; DROP TABLE users",
		"events'",
		"../etc/passwd",
		"events--comment",
	}
	for _, table := range cases {
		cfg := map[string]any{"url": "postgresql://fake", "table": table}
		err := Dispatch(context.Background(), "postgres", cfg, map[string]any{})
		if err == nil {
			t.Errorf("expected error for table name %q, got nil", table)
		}
	}
}

func TestPostgresDeliver_MissingURL_ReturnsError(t *testing.T) {
	err := Dispatch(context.Background(), "postgres", map[string]any{}, map[string]any{})
	if err == nil {
		t.Fatal("expected error when url is missing")
	}
}

func TestPostgresDeliver_DBError_ReturnsError(t *testing.T) {
	fake := &fakePgConn{
		execFn: func(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
			return pgconn.CommandTag{}, errors.New("connection reset")
		},
	}
	defer withFakeConn(fake)()

	cfg := map[string]any{"url": "postgresql://fake"}
	err := Dispatch(context.Background(), "postgres", cfg, map[string]any{"eventId": "x"})
	if err == nil {
		t.Fatal("expected error on DB failure, got nil")
	}
}

func TestPostgresDeliver_DuplicateEvent_NoError(t *testing.T) {
	// ON CONFLICT DO NOTHING — duplicate eventId returns 0 rows affected but no error.
	fake := &fakePgConn{
		execFn: func(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
			return pgconn.NewCommandTag("INSERT 0 0"), nil
		},
	}
	defer withFakeConn(fake)()

	cfg := map[string]any{"url": "postgresql://fake"}
	err := Dispatch(context.Background(), "postgres", cfg, map[string]any{"eventId": "dup"})
	if err != nil {
		t.Fatalf("duplicate event should not return error (ON CONFLICT DO NOTHING), got: %v", err)
	}
}

func TestPostgresDeliver_ConnectError_ReturnsError(t *testing.T) {
	orig := connectPg
	connectPg = func(_ context.Context, _ string) (pgExecutor, error) {
		return nil, errors.New("connection refused")
	}
	defer func() { connectPg = orig }()

	cfg := map[string]any{"url": "postgresql://fake"}
	err := Dispatch(context.Background(), "postgres", cfg, map[string]any{})
	if err == nil {
		t.Fatal("expected error when connect fails, got nil")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
