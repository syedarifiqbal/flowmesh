package dlqhandler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/flowmesh/delivery/internal/store"
)

const (
	replayExchange   = "pipeline.events"
	replayRoutingKey = "delivery.event"
)

type Handler struct {
	store  *store.DLQStore
	conn   *amqp.Connection
	logger *slog.Logger
}

func New(s *store.DLQStore, conn *amqp.Connection, logger *slog.Logger) *Handler {
	return &Handler{store: s, conn: conn, logger: logger}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Route: GET /dlq  or  POST /dlq/:id/replay
	path := strings.TrimPrefix(r.URL.Path, "/dlq")
	path = strings.TrimPrefix(path, "/")

	switch {
	case r.Method == http.MethodGet && path == "":
		h.list(w, r)
	case r.Method == http.MethodPost && strings.HasSuffix(path, "/replay"):
		id := strings.TrimSuffix(path, "/replay")
		h.replay(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

type dlqEventResponse struct {
	ID              string     `json:"id"`
	WorkspaceID     string     `json:"workspaceId"`
	EventID         string     `json:"eventId"`
	CorrelationID   string     `json:"correlationId"`
	EventName       string     `json:"eventName"`
	Source          string     `json:"source"`
	DestinationID   string     `json:"destinationId"`
	DestinationType string     `json:"destinationType"`
	Payload         any        `json:"payload"`
	ErrorReason     string     `json:"errorReason"`
	Attempts        int        `json:"attempts"`
	CreatedAt       time.Time  `json:"createdAt"`
	ReplayedAt      *time.Time `json:"replayedAt"`
	ResolvedAt      *time.Time `json:"resolvedAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.Header.Get("X-Workspace-Id")
	if workspaceID == "" {
		jsonError(w, "missing workspace", http.StatusBadRequest)
		return
	}

	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	events, total, err := h.store.List(r.Context(), workspaceID, limit, offset)
	if err != nil {
		h.logger.Error("dlq list failed", "err", err)
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}

	items := make([]dlqEventResponse, 0, len(events))
	for _, e := range events {
		var payload any
		_ = json.Unmarshal(e.Payload, &payload)
		items = append(items, dlqEventResponse{
			ID: e.ID, WorkspaceID: e.WorkspaceID, EventID: e.EventID,
			CorrelationID: e.CorrelationID, EventName: e.EventName, Source: e.Source,
			DestinationID: e.DestinationID, DestinationType: e.DestinationType,
			Payload: payload, ErrorReason: e.ErrorReason, Attempts: e.Attempts,
			CreatedAt: e.CreatedAt, ReplayedAt: e.ReplayedAt, ResolvedAt: e.ResolvedAt,
		})
	}

	jsonOK(w, map[string]any{"events": items, "total": total, "limit": limit, "offset": offset})
}

func (h *Handler) replay(w http.ResponseWriter, r *http.Request, id string) {
	workspaceID := r.Header.Get("X-Workspace-Id")
	if workspaceID == "" {
		jsonError(w, "missing workspace", http.StatusBadRequest)
		return
	}

	event, err := h.store.Get(r.Context(), id)
	if err != nil {
		h.logger.Error("dlq get failed", "id", id, "err", err)
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if event.WorkspaceID != workspaceID {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	if err := h.publish(r.Context(), id, event.Payload); err != nil {
		h.logger.Error("dlq replay publish failed", "id", id, "err", err)
		jsonError(w, "replay failed", http.StatusInternalServerError)
		return
	}

	if err := h.store.MarkReplayed(r.Context(), id); err != nil {
		h.logger.Warn("dlq mark replayed failed", "id", id, "err", err)
	}

	h.logger.Info("dlq event replayed", "id", id, "workspaceId", workspaceID)
	jsonOK(w, map[string]string{"status": "replayed"})
}

// publish injects the DLQ event ID into the message meta so the consumer can
// call MarkResolved if delivery succeeds this time.
func (h *Handler) publish(ctx context.Context, dlqEventID string, payload json.RawMessage) error {
	var msg map[string]interface{}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("unmarshal payload: %w", err)
	}
	if meta, ok := msg["meta"].(map[string]interface{}); ok {
		meta["dlqEventId"] = dlqEventID
	} else {
		msg["meta"] = map[string]interface{}{"dlqEventId": dlqEventID}
	}
	modified, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal modified payload: %w", err)
	}

	ch, err := h.conn.Channel()
	if err != nil {
		return err
	}
	defer ch.Close()

	return ch.PublishWithContext(ctx, replayExchange, replayRoutingKey, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         modified,
	})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}
