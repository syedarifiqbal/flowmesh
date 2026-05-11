package destination

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// httpPost is the shared HTTP transport for all webhook-style destination drivers.
// It builds a POST request, sets Content-Type and User-Agent, enforces a 10s timeout,
// drains the response body, and returns an error for any non-2xx status code.
// Pass extraHeaders for driver-specific headers (e.g. X-FlowMesh-Signature); pass nil if none.
func httpPost(ctx context.Context, url string, body []byte, extraHeaders map[string]string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "FlowMesh-Delivery/1.0")
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}
	return nil
}
