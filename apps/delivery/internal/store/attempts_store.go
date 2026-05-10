package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DeliveryAttempt struct {
	WorkspaceID     string
	EventID         string
	CorrelationID   string
	DestinationID   string
	DestinationType string
	Attempt         int
	Outcome         string // "success" | "failure"
	Error           string
	DurationMs      int64
	CreatedAt       time.Time
}

type AttemptsStore struct {
	pool *pgxpool.Pool
}

func NewAttemptsStore(pool *pgxpool.Pool) *AttemptsStore {
	return &AttemptsStore{pool: pool}
}

func (s *AttemptsStore) Write(ctx context.Context, a DeliveryAttempt) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO delivery.delivery_attempts
		  (workspace_id, event_id, correlation_id, destination_id, destination_type,
		   attempt, outcome, error, duration_ms)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, a.WorkspaceID, a.EventID, a.CorrelationID, a.DestinationID, a.DestinationType,
		a.Attempt, a.Outcome, nullableString(a.Error), a.DurationMs)
	return err
}

func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
