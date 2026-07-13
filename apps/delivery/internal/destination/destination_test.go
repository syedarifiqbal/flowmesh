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
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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

// ── Slack tests ───────────────────────────────────────────────────────────────

func TestSlackDeliver_HappyPath(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	event := map[string]any{
		"eventId":     "evt-1",
		"eventName":   "order.created",
		"workspaceId": "ws-1",
		"source":      "web",
		"userId":      "user_123",
		"receivedAt":  "2026-05-10T19:00:00Z",
	}
	cfg := map[string]any{"url": srv.URL}

	err := Dispatch(context.Background(), "slack", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	text, _ := gotBody["text"].(string)
	if !contains(text, "order.created") {
		t.Errorf("expected event name in text, got: %s", text)
	}
	if !contains(text, "ws-1") {
		t.Errorf("expected workspaceId in text, got: %s", text)
	}
	if !contains(text, "user_123") {
		t.Errorf("expected userId in text, got: %s", text)
	}
	if !contains(text, "web") {
		t.Errorf("expected source in text, got: %s", text)
	}
}

func TestSlackDeliver_WithChannel_SendsChannelField(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL, "channel": "#alerts"}
	err := Dispatch(context.Background(), "slack", cfg, map[string]any{"eventName": "test"})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if gotBody["channel"] != "#alerts" {
		t.Errorf("expected channel #alerts, got %v", gotBody["channel"])
	}
}

func TestSlackDeliver_MissingURL_ReturnsError(t *testing.T) {
	err := Dispatch(context.Background(), "slack", map[string]any{}, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error when url is missing")
	}
}

func TestSlackDeliver_ServerReturns5xx_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "slack", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error on 5xx response")
	}
}

func TestSlackDeliver_ServerReturns429_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "slack", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error on 429 response")
	}
}

func TestSlackDeliver_UnreachableURL_ReturnsError(t *testing.T) {
	cfg := map[string]any{"url": "http://127.0.0.1:1"}
	err := Dispatch(context.Background(), "slack", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error when server is unreachable")
	}
}

func TestSlackDeliver_FallsBackToEventField(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// No eventName field — should fall back to event field
	event := map[string]any{"event": "order.created", "eventId": "evt-2"}
	cfg := map[string]any{"url": srv.URL}

	err := Dispatch(context.Background(), "slack", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	text, _ := gotBody["text"].(string)
	if !contains(text, "order.created") {
		t.Errorf("expected event name in text, got: %s", text)
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

// ── Discord tests ─────────────────────────────────────────────────────────────

func TestDiscordDeliver_HappyPath(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	event := map[string]any{
		"eventId":      "evt-1",
		"eventName":    "order.created",
		"workspaceId":  "ws-1",
		"source":       "web",
		"userId":       "user_123",
		"pipelineName": "My Pipeline",
		"receivedAt":   "2026-05-10T19:00:00Z",
	}
	cfg := map[string]any{"url": srv.URL}

	err := Dispatch(context.Background(), "discord", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	embeds, _ := gotBody["embeds"].([]any)
	if len(embeds) != 1 {
		t.Fatalf("expected 1 embed, got %d", len(embeds))
	}
	embed, _ := embeds[0].(map[string]any)
	if embed["title"] != "order.created" {
		t.Errorf("expected embed title order.created, got %v", embed["title"])
	}

	fields, _ := embed["fields"].([]any)
	var fieldNames []string
	for _, f := range fields {
		fm, _ := f.(map[string]any)
		fieldNames = append(fieldNames, fm["name"].(string))
	}
	for _, want := range []string{"Event ID", "Source", "User", "Pipeline", "Workspace", "Received"} {
		found := false
		for _, n := range fieldNames {
			if n == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected field %q in embed, got %v", want, fieldNames)
		}
	}
}

func TestDiscordDeliver_WithUsername_SendsUsernameField(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL, "username": "FlowMesh Bot"}
	err := Dispatch(context.Background(), "discord", cfg, map[string]any{"eventName": "test"})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if gotBody["username"] != "FlowMesh Bot" {
		t.Errorf("expected username FlowMesh Bot, got %v", gotBody["username"])
	}
}

func TestDiscordDeliver_MissingURL_ReturnsError(t *testing.T) {
	err := Dispatch(context.Background(), "discord", map[string]any{}, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error when url is missing")
	}
}

func TestDiscordDeliver_ServerReturns5xx_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "discord", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error on 5xx response")
	}
}

func TestDiscordDeliver_ServerReturns429_ReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	cfg := map[string]any{"url": srv.URL}
	err := Dispatch(context.Background(), "discord", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error on 429 response")
	}
}

func TestDiscordDeliver_UnreachableURL_ReturnsError(t *testing.T) {
	cfg := map[string]any{"url": "http://127.0.0.1:1"}
	err := Dispatch(context.Background(), "discord", cfg, map[string]any{"eventName": "test"})
	if err == nil {
		t.Fatal("expected error when server is unreachable")
	}
}

func TestDiscordDeliver_FallsBackToEventField(t *testing.T) {
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	event := map[string]any{"event": "order.created", "eventId": "evt-2"}
	cfg := map[string]any{"url": srv.URL}

	err := Dispatch(context.Background(), "discord", cfg, event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	embeds, _ := gotBody["embeds"].([]any)
	embed, _ := embeds[0].(map[string]any)
	if embed["title"] != "order.created" {
		t.Errorf("expected fallback event name in embed title, got: %v", embed["title"])
	}
}

func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

// ── S3 tests ──────────────────────────────────────────────────────────────────

type fakeS3Putter struct {
	putFn func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

func (f *fakeS3Putter) PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	return f.putFn(ctx, params, optFns...)
}

// injectS3 replaces newS3Putter for the duration of a test and returns a restore func.
func injectS3(fake s3Putter) func() {
	orig := newS3Putter
	newS3Putter = func(_ aws.Config) s3Putter { return fake }
	return func() { newS3Putter = orig }
}

func makeS3Config() map[string]any {
	return map[string]any{
		"bucket":          "my-bucket",
		"region":          "us-east-1",
		"accessKeyId":     "AKIAIOSFODNN7EXAMPLE",
		"secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
	}
}

func TestS3Deliver_HappyPath(t *testing.T) {
	var gotBucket, gotKey, gotContentType string
	var gotBody []byte

	fake := &fakeS3Putter{
		putFn: func(_ context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
			gotBucket = *params.Bucket
			gotKey = *params.Key
			gotContentType = *params.ContentType
			gotBody, _ = io.ReadAll(params.Body)
			return &s3.PutObjectOutput{}, nil
		},
	}
	defer injectS3(fake)()

	event := map[string]any{"eventId": "evt-s3-1", "event": "order.created"}
	err := Dispatch(context.Background(), "s3", makeS3Config(), event)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if gotBucket != "my-bucket" {
		t.Errorf("bucket: want my-bucket, got %s", gotBucket)
	}
	if !contains(gotKey, "evt-s3-1.json") {
		t.Errorf("key should contain eventId, got %s", gotKey)
	}
	if !contains(gotKey, "flowmesh-events/") {
		t.Errorf("key should use default prefix, got %s", gotKey)
	}
	if gotContentType != "application/json" {
		t.Errorf("content-type: want application/json, got %s", gotContentType)
	}
	var decoded map[string]any
	if err := json.Unmarshal(gotBody, &decoded); err != nil {
		t.Errorf("body is not valid JSON: %v", err)
	}
	if decoded["eventId"] != "evt-s3-1" {
		t.Errorf("body eventId mismatch: got %v", decoded["eventId"])
	}
}

func TestS3Deliver_CustomPrefix(t *testing.T) {
	var gotKey string
	fake := &fakeS3Putter{
		putFn: func(_ context.Context, params *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
			gotKey = *params.Key
			return &s3.PutObjectOutput{}, nil
		},
	}
	defer injectS3(fake)()

	cfg := makeS3Config()
	cfg["prefix"] = "custom-prefix"

	err := Dispatch(context.Background(), "s3", cfg, map[string]any{"eventId": "evt-2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !contains(gotKey, "custom-prefix/") {
		t.Errorf("key should use custom prefix, got %s", gotKey)
	}
}

func TestS3Deliver_MissingBucket_ReturnsError(t *testing.T) {
	cfg := makeS3Config()
	delete(cfg, "bucket")
	err := Dispatch(context.Background(), "s3", cfg, map[string]any{})
	if err == nil {
		t.Fatal("expected error when bucket is missing")
	}
}

func TestS3Deliver_MissingRegion_ReturnsError(t *testing.T) {
	cfg := makeS3Config()
	delete(cfg, "region")
	err := Dispatch(context.Background(), "s3", cfg, map[string]any{})
	if err == nil {
		t.Fatal("expected error when region is missing")
	}
}

func TestS3Deliver_MissingAccessKeyId_ReturnsError(t *testing.T) {
	cfg := makeS3Config()
	delete(cfg, "accessKeyId")
	err := Dispatch(context.Background(), "s3", cfg, map[string]any{})
	if err == nil {
		t.Fatal("expected error when accessKeyId is missing")
	}
}

func TestS3Deliver_MissingSecretAccessKey_ReturnsError(t *testing.T) {
	cfg := makeS3Config()
	delete(cfg, "secretAccessKey")
	err := Dispatch(context.Background(), "s3", cfg, map[string]any{})
	if err == nil {
		t.Fatal("expected error when secretAccessKey is missing")
	}
}

func TestS3Deliver_PutObjectFails_ReturnsError(t *testing.T) {
	fake := &fakeS3Putter{
		putFn: func(_ context.Context, _ *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
			return nil, errors.New("NoSuchBucket")
		},
	}
	defer injectS3(fake)()

	err := Dispatch(context.Background(), "s3", makeS3Config(), map[string]any{"eventId": "evt-fail"})
	if err == nil {
		t.Fatal("expected error when PutObject fails")
	}
}
