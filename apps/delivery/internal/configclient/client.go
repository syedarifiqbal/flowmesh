package configclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Destination struct {
	ID     string         `json:"id"`
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *Client) GetDestination(ctx context.Context, workspaceID, destinationID string) (*Destination, error) {
	url := fmt.Sprintf("%s/internal/destinations/%s", c.baseURL, destinationID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("x-workspace-id", workspaceID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("config-service request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("config-service returned %d: %s", resp.StatusCode, string(body))
	}

	var dest Destination
	if err := json.Unmarshal(body, &dest); err != nil {
		return nil, fmt.Errorf("decode destination: %w", err)
	}

	return &dest, nil
}
