package metricshandler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func New(pool *pgxpool.Pool, logger *slog.Logger) *Handler {
	return &Handler{pool: pool, logger: logger}
}

type errorRateBucket struct {
	Time   time.Time `json:"time"`
	Total  int64     `json:"total"`
	Failed int64     `json:"failed"`
	Rate   float64   `json:"rate"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}

	workspaceID := r.Header.Get("X-Workspace-Id")
	if workspaceID == "" {
		jsonError(w, "missing workspace", http.StatusBadRequest)
		return
	}

	rangeParam := r.URL.Query().Get("range")
	bucketInterval, lookback, ok := rangeParams(rangeParam)
	if !ok {
		jsonError(w, "invalid range — use 1h, 24h, or 7d", http.StatusBadRequest)
		return
	}

	buckets, err := h.query(r.Context(), workspaceID, bucketInterval, lookback)
	if err != nil {
		h.logger.Error("error rate query failed", "err", err)
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"buckets": buckets}) //nolint:errcheck
}

func (h *Handler) query(ctx context.Context, workspaceID, bucketInterval, lookback string) ([]errorRateBucket, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT
			time_bucket($1::interval, created_at) AS bucket,
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE outcome = 'failure') AS failed
		FROM delivery.delivery_attempts
		WHERE workspace_id = $2
		  AND created_at >= NOW() - $3::interval
		GROUP BY 1
		ORDER BY 1 ASC
	`, bucketInterval, workspaceID, lookback)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buckets []errorRateBucket
	for rows.Next() {
		var b errorRateBucket
		if err := rows.Scan(&b.Time, &b.Total, &b.Failed); err != nil {
			return nil, err
		}
		if b.Total > 0 {
			b.Rate = float64(b.Failed) / float64(b.Total) * 100
		}
		buckets = append(buckets, b)
	}
	if buckets == nil {
		buckets = []errorRateBucket{}
	}
	return buckets, rows.Err()
}

func rangeParams(r string) (bucketInterval, lookback string, ok bool) {
	switch r {
	case "1h", "":
		return "5 minutes", "1 hour", true
	case "24h":
		return "1 hour", "24 hours", true
	case "7d":
		return "6 hours", "7 days", true
	default:
		return "", "", false
	}
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}
