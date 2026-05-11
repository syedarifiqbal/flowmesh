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

// discordDeliver posts the event as a Discord incoming-webhook message using embeds.
// Config fields:
//   - url (required) — Discord webhook URL
//   - username (optional) — override the webhook display name
func discordDeliver(ctx context.Context, config map[string]any, event map[string]any) error {
	webhookURL, ok := config["url"].(string)
	if !ok || webhookURL == "" {
		return fmt.Errorf("discord config missing url")
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

	fields := []map[string]any{
		{"name": "Event ID", "value": fmt.Sprintf("`%s`", eventID), "inline": true},
		{"name": "Source", "value": fmt.Sprintf("`%s`", source), "inline": true},
	}
	if userID != "" {
		fields = append(fields, map[string]any{"name": "User", "value": fmt.Sprintf("`%s`", userID), "inline": true})
	}
	if pipelineName != "" {
		fields = append(fields, map[string]any{"name": "Pipeline", "value": pipelineName, "inline": true})
	}
	if workspaceID != "" {
		fields = append(fields, map[string]any{"name": "Workspace", "value": fmt.Sprintf("`%s`", workspaceID), "inline": true})
	}
	if receivedAt != "" {
		fields = append(fields, map[string]any{"name": "Received", "value": fmt.Sprintf("`%s`", receivedAt), "inline": true})
	}

	embed := map[string]any{
		"title":  eventName,
		"color":  5763719, // green
		"fields": fields,
	}

	payload := map[string]any{"embeds": []map[string]any{embed}}
	if username, ok := config["username"].(string); ok && username != "" {
		payload["username"] = username
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal discord payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build discord request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("discord request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook returned %d", resp.StatusCode)
	}

	return nil
}
