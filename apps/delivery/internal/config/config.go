package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	RabbitMQURL      string
	ConfigServiceURL string
	Port             int
}

func Load() (*Config, error) {
	rabbitURL := os.Getenv("RABBITMQ_URL")
	if rabbitURL == "" {
		return nil, fmt.Errorf("RABBITMQ_URL is required")
	}

	configURL := os.Getenv("CONFIG_SERVICE_URL")
	if configURL == "" {
		return nil, fmt.Errorf("CONFIG_SERVICE_URL is required")
	}

	port := 3006
	if p := os.Getenv("PORT"); p != "" {
		var err error
		port, err = strconv.Atoi(p)
		if err != nil {
			return nil, fmt.Errorf("invalid PORT: %w", err)
		}
	}

	return &Config{
		RabbitMQURL:      rabbitURL,
		ConfigServiceURL: configURL,
		Port:             port,
	}, nil
}
