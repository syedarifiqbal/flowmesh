CREATE TABLE IF NOT EXISTS delivery.delivery_attempts (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    workspace_id     TEXT        NOT NULL,
    event_id         TEXT        NOT NULL,
    correlation_id   TEXT,
    destination_id   TEXT        NOT NULL,
    destination_type TEXT        NOT NULL,
    attempt          INT         NOT NULL,
    outcome          TEXT        NOT NULL CHECK (outcome IN ('success', 'failure')),
    error            TEXT,
    duration_ms      BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
);

SELECT create_hypertable(
    'delivery.delivery_attempts',
    'created_at',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS delivery_attempts_workspace_time_idx
    ON delivery.delivery_attempts (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_attempts_event_id_idx
    ON delivery.delivery_attempts (event_id);
