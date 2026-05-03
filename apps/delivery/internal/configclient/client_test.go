package configclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetDestination_HappyPath(t *testing.T) {
	want := Destination{
		ID:   "dest-1",
		Name: "My Webhook",
		Type: "webhook",
		Config: map[string]any{
			"url":    "https://example.com/hook",
			"secret": "s3cr3t",
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/internal/destinations/dest-1" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("x-workspace-id") != "ws-1" {
			t.Errorf("expected x-workspace-id ws-1, got %s", r.Header.Get("x-workspace-id"))
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(want)
	}))
	defer srv.Close()

	client := New(srv.URL)
	got, err := client.GetDestination(context.Background(), "ws-1", "dest-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got.ID != want.ID {
		t.Errorf("ID: got %s, want %s", got.ID, want.ID)
	}
	if got.Type != want.Type {
		t.Errorf("Type: got %s, want %s", got.Type, want.Type)
	}
	if got.Config["url"] != "https://example.com/hook" {
		t.Errorf("Config.url: got %v, want https://example.com/hook", got.Config["url"])
	}
}

func TestGetDestination_NotFound_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"message":"not found"}`))
	}))
	defer srv.Close()

	client := New(srv.URL)
	_, err := client.GetDestination(context.Background(), "ws-1", "missing-dest")
	if err == nil {
		t.Fatal("expected error on 404, got nil")
	}
}

func TestGetDestination_ServerError_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	client := New(srv.URL)
	_, err := client.GetDestination(context.Background(), "ws-1", "dest-1")
	if err == nil {
		t.Fatal("expected error on 500, got nil")
	}
}

func TestGetDestination_InvalidJSON_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`not-json`))
	}))
	defer srv.Close()

	client := New(srv.URL)
	_, err := client.GetDestination(context.Background(), "ws-1", "dest-1")
	if err == nil {
		t.Fatal("expected error on invalid JSON, got nil")
	}
}

func TestGetDestination_UnreachableServer_ReturnsError(t *testing.T) {
	client := New("http://127.0.0.1:1")
	_, err := client.GetDestination(context.Background(), "ws-1", "dest-1")
	if err == nil {
		t.Fatal("expected error when server is unreachable")
	}
}
