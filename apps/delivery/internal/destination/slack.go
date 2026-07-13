package destination

import (
	"context"
	"encoding/json"
	"fmt"
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

	footer := fmt.Sprintf("event_id: `%s`  workspace: `%s`", eventID, workspaceID)
	if pipelineName != "" {
		footer += fmt.Sprintf("  pipeline: `%s`", pipelineName)
	}

	text := fmt.Sprintf("*%s*\n%s\n%s", eventName, meta, footer)

	payload := map[string]any{"text": text}
	if ch, ok := config["channel"].(string); ok && ch != "" {
		payload["channel"] = ch
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal slack payload: %w", err)
	}

	return httpPost(ctx, webhookURL, body, nil)
}
