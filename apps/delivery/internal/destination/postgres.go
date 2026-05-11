package destination

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

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
