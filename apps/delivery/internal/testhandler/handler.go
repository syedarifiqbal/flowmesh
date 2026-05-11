package testhandler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type request struct {
	Type   string         `json:"type"`
	Config map[string]any `json:"config"`
}

type response struct {
	Ok    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeResponse(w, http.StatusBadRequest, response{Ok: false, Error: "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var testErr error
	switch req.Type {
	case "webhook":
		testErr = testWebhook(ctx, req.Config)
	case "postgres":
		testErr = testPostgres(ctx, req.Config)
	case "slack", "discord":
		testErr = testWebhookURL(ctx, req.Config)
	default:
		writeResponse(w, http.StatusBadRequest, response{Ok: false, Error: fmt.Sprintf("unsupported destination type: %s", req.Type)})
		return
	}

	if testErr != nil {
		writeResponse(w, http.StatusOK, response{Ok: false, Error: testErr.Error()})
		return
	}
	writeResponse(w, http.StatusOK, response{Ok: true})
}

// testWebhookURL verifies that the configured URL is reachable.
// Used for Slack and Discord where we cannot send a real event payload during a test.
// Any non-5xx response means the URL accepted the connection and the credentials are likely valid.
func testWebhookURL(ctx context.Context, config map[string]any) error {
	url, ok := config["url"].(string)
	if !ok || url == "" {
		return fmt.Errorf("missing url in config")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-FlowMesh-Test", "true")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach URL: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return fmt.Errorf("server returned %d — check your webhook URL", resp.StatusCode)
	}
	return nil
}

func testWebhook(ctx context.Context, config map[string]any) error {
	return testWebhookURL(ctx, config)
}

func testPostgres(ctx context.Context, config map[string]any) error {
	connURL, ok := config["url"].(string)
	if !ok || connURL == "" {
		return fmt.Errorf("missing url in config")
	}

	conn, err := pgx.Connect(ctx, connURL)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	defer conn.Close(ctx)

	table, _ := config["table"].(string)
	if table == "" {
		table = "flowmesh_events"
	}

	var exists bool
	row := conn.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table)
	if err := row.Scan(&exists); err != nil {
		return fmt.Errorf("could not check table: %w", err)
	}
	if !exists {
		return fmt.Errorf("table %q does not exist", table)
	}

	return nil
}

func writeResponse(w http.ResponseWriter, status int, resp response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}
