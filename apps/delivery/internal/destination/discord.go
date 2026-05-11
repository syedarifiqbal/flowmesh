package destination

import (
	"context"
	"encoding/json"
	"fmt"
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

	return httpPost(ctx, webhookURL, body, nil)
}
