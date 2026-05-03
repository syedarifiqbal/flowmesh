package destination

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

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

	// Verify HMAC signature
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
