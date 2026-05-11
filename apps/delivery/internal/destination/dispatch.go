package destination

import (
	"context"
	"fmt"
)

// Driver delivers an event to a specific destination type.
type Driver interface {
	Deliver(ctx context.Context, config map[string]any, event map[string]any) error
}

// Dispatch routes to the correct driver based on destination type.
func Dispatch(ctx context.Context, destType string, config map[string]any, event map[string]any) error {
	switch destType {
	case "webhook":
		return webhookDeliver(ctx, config, event)
	case "postgres":
		return postgresDeliver(ctx, config, event)
	case "slack":
		return slackDeliver(ctx, config, event)
	case "discord":
		return discordDeliver(ctx, config, event)
	default:
		return fmt.Errorf("unsupported destination type: %s", destType)
	}
}
