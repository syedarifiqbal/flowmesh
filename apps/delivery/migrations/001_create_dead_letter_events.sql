CREATE SCHEMA IF NOT EXISTS delivery;

CREATE TABLE IF NOT EXISTS delivery.dead_letter_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     TEXT        NOT NULL,
  event_id         TEXT        NOT NULL,
  correlation_id   TEXT,
  event_name       TEXT,
  source           TEXT,
  destination_id   TEXT        NOT NULL,
  destination_type TEXT        NOT NULL,
  payload          JSONB       NOT NULL,
  error_reason     TEXT        NOT NULL,
  attempts         INT         NOT NULL DEFAULT 5,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replayed_at      TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dead_letter_events_workspace_created
  ON delivery.dead_letter_events (workspace_id, created_at DESC);
