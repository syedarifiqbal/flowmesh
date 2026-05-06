package destination

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Driver delivers an event to a specific destination type.
type Driver interface {
	Deliver(ctx context.Context, config map[string]any, event map[string]any) error
}

// Dispatch routes to the correct driver based on destination type.
func Dispatch(ctx context.Context, destType string, config map[string]any, event map[string]any) error {
	switch destType {
	case "webhook":
		return webhookDeliver(ctx, config, event)
	case "postgres":
		return postgresDeliver(ctx, config, event)
	default:
		return fmt.Errorf("unsupported destination type: %s", destType)
	}
}

// ── Webhook ───────────────────────────────────────────────────────────────────

func webhookDeliver(ctx context.Context, config map[string]any, event map[string]any) error {
	url, ok := config["url"].(string)
	if !ok || url == "" {
		return fmt.Errorf("webhook config missing url")
	}

	secret, _ := config["secret"].(string)

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")

	if secret != "" {
		sig := hmac.New(sha256.New, []byte(secret))
		sig.Write(body)
		req.Header.Set("X-FlowMesh-Signature", hex.EncodeToString(sig.Sum(nil)))
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned %d", resp.StatusCode)
	}

	return nil
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

// pgExecutor is the subset of *pgx.Conn used by insertEvent.
// Declared as an interface so tests can inject a fake without a real database.
type pgExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Close(ctx context.Context) error
}

// connectPg opens a real pgx connection. Replaced by tests to inject a fake.
var connectPg = func(ctx context.Context, connURL string) (pgExecutor, error) {
	return pgx.Connect(ctx, connURL)
}

// validTableName allows letters, digits, underscores, and a single dot for
// schema-qualified names (e.g. "public.flowmesh_events"). This prevents SQL
// injection through the table config field — identifiers cannot be parameterised.
var validTableName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$`)

func postgresDeliver(ctx context.Context, config map[string]any, event map[string]any) error {
	connURL, ok := config["url"].(string)
	if !ok || connURL == "" {
		return fmt.Errorf("postgres config missing url")
	}

	table, _ := config["table"].(string)
	if table == "" {
		table = "flowmesh_events"
	}
	if !validTableName.MatchString(table) {
		return fmt.Errorf("postgres config: invalid table name %q", table)
	}

	conn, err := connectPg(ctx, connURL)
	if err != nil {
		return fmt.Errorf("postgres connect: %w", err)
	}
	defer conn.Close(ctx)

	return insertEvent(ctx, conn, table, event)
}

// insertEvent executes the INSERT against the given connection.
// Separated from postgresDeliver so it can be unit-tested with a fake conn.
func insertEvent(ctx context.Context, conn pgExecutor, table string, event map[string]any) error {
	eventID, _ := event["eventId"].(string)
	workspaceID, _ := event["workspaceId"].(string)
	eventName, _ := event["eventName"].(string)

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event payload: %w", err)
	}

	// ON CONFLICT DO NOTHING — idempotent delivery; duplicate eventIds are silently skipped.
	sql := fmt.Sprintf(
		`INSERT INTO %s (event_id, workspace_id, event_name, payload) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING`,
		table,
	)

	_, err = conn.Exec(ctx, sql, eventID, workspaceID, eventName, payload)
	if err != nil {
		return fmt.Errorf("postgres insert: %w", err)
	}
	return nil
}
