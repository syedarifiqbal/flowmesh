package destination

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// slackDeliver posts the event as a Slack incoming-webhook message.
// Config fields:
//   - url (required) — Slack incoming webhook URL
//   - channel (optional) — override the default channel set on the webhook
func slackDeliver(ctx context.Context, config map[string]any, event map[string]any) error {
	webhookURL, ok := config["url"].(string)
	if !ok || webhookURL == "" {
		return fmt.Errorf("slack config missing url")
	}

	eventName, _ := event["eventName"].(string)
	if eventName == "" {
		eventName, _ = event["event"].(string)
	}
	eventID, _ := event["eventId"].(string)
	workspaceID, _ := event["workspaceId"].(string)
	pipelineName, _ := event["pipelineName"].(string)
	source, _ := event["source"].(string)
	receivedAt, _ := event["receivedAt"].(string)

	userID, _ := event["userId"].(string)
	if userID == "" {
		userID, _ = event["anonymousId"].(string)
	}

	meta := fmt.Sprintf("source: `%s`", source)
	if userID != "" {
		meta += fmt.Sprintf("  |  user: `%s`", userID)
	}
	if receivedAt != "" {
		meta += fmt.Sprintf("  |  received: `%s`", receivedAt)
	}

	workspace := workspaceID
	if pipelineName != "" {
		workspace = fmt.Sprintf("%s (`%s`)", pipelineName, workspaceID)
	}

	text := fmt.Sprintf("*%s*\n%s\nevent_id: `%s`  workspace: %s", eventName, meta, eventID, workspace)

	payload := map[string]any{"text": text}
	if ch, ok := config["channel"].(string); ok && ch != "" {
		payload["channel"] = ch
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal slack payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build slack request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("slack request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("slack webhook returned %d", resp.StatusCode)
	}

	return nil
}
