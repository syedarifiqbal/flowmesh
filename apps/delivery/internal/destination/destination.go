package destination

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
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
	default:
		return fmt.Errorf("unsupported destination type: %s", destType)
	}
}

func webhookDeliver(ctx context.Context, config map[string]any, event map[string]any) error {
	url, ok := config["url"].(string)
	if !ok || url == "" {
		return fmt.Errorf("webhook config missing url")
	}

	secret, _ := config["secret"].(string)

	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")

	if secret != "" {
		sig := hmac.New(sha256.New, []byte(secret))
		sig.Write(body)
		req.Header.Set("X-FlowMesh-Signature", hex.EncodeToString(sig.Sum(nil)))
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned %d", resp.StatusCode)
	}

	return nil
}
