package destination

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

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

	var extraHeaders map[string]string
	if secret != "" {
		sig := hmac.New(sha256.New, []byte(secret))
		sig.Write(body)
		extraHeaders = map[string]string{
			"X-FlowMesh-Signature": hex.EncodeToString(sig.Sum(nil)),
		}
	}

	return httpPost(ctx, url, body, extraHeaders)
}
