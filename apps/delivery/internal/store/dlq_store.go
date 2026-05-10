package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DLQEvent struct {
	ID              string
	WorkspaceID     string
	EventID         string
	CorrelationID   string
	EventName       string
	Source          string
	DestinationID   string
	DestinationType string
	Payload         json.RawMessage
	ErrorReason     string
	Attempts        int
	CreatedAt       time.Time
	ReplayedAt      *time.Time
	ResolvedAt      *time.Time
}

type DLQStore struct {
	pool *pgxpool.Pool
}

func NewDLQStore(pool *pgxpool.Pool) *DLQStore {
	return &DLQStore{pool: pool}
}

func (s *DLQStore) Write(ctx context.Context, e DLQEvent) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO delivery.dead_letter_events
		  (workspace_id, event_id, correlation_id, event_name, source,
		   destination_id, destination_type, payload, error_reason, attempts)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`, e.WorkspaceID, e.EventID, e.CorrelationID, e.EventName, e.Source,
		e.DestinationID, e.DestinationType, []byte(e.Payload), e.ErrorReason, e.Attempts)
	return err
}

func (s *DLQStore) List(ctx context.Context, workspaceID string, limit, offset int) ([]DLQEvent, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM delivery.dead_letter_events WHERE workspace_id = $1`,
		workspaceID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, event_id, correlation_id, event_name, source,
		       destination_id, destination_type, payload, error_reason, attempts,
		       created_at, replayed_at, resolved_at
		FROM delivery.dead_letter_events
		WHERE workspace_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, workspaceID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []DLQEvent
	for rows.Next() {
		var e DLQEvent
		var payload []byte
		if err := rows.Scan(
			&e.ID, &e.WorkspaceID, &e.EventID, &e.CorrelationID, &e.EventName, &e.Source,
			&e.DestinationID, &e.DestinationType, &payload, &e.ErrorReason, &e.Attempts,
			&e.CreatedAt, &e.ReplayedAt, &e.ResolvedAt,
		); err != nil {
			return nil, 0, err
		}
		e.Payload = json.RawMessage(payload)
		events = append(events, e)
	}
	return events, total, rows.Err()
}

func (s *DLQStore) Get(ctx context.Context, id string) (*DLQEvent, error) {
	var e DLQEvent
	var payload []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, event_id, correlation_id, event_name, source,
		       destination_id, destination_type, payload, error_reason, attempts,
		       created_at, replayed_at, resolved_at
		FROM delivery.dead_letter_events
		WHERE id = $1
	`, id).Scan(
		&e.ID, &e.WorkspaceID, &e.EventID, &e.CorrelationID, &e.EventName, &e.Source,
		&e.DestinationID, &e.DestinationType, &payload, &e.ErrorReason, &e.Attempts,
		&e.CreatedAt, &e.ReplayedAt, &e.ResolvedAt,
	)
	if err != nil {
		return nil, err
	}
	e.Payload = json.RawMessage(payload)
	return &e, nil
}

func (s *DLQStore) MarkReplayed(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE delivery.dead_letter_events SET replayed_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("not found")
	}
	return nil
}

func (s *DLQStore) MarkResolved(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE delivery.dead_letter_events SET resolved_at = NOW() WHERE id = $1`,
		id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("not found")
	}
	return nil
}
