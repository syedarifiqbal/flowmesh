package main

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/flowmesh/delivery/internal/config"
	"github.com/flowmesh/delivery/internal/configclient"
	"github.com/flowmesh/delivery/internal/consumer"
)

const (
	connectMaxRetries  = 10
	connectBaseDelayMs = 1000
	connectMaxDelayMs  = 30000
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "err", err)
		os.Exit(1)
	}

	conn, err := connectRabbitMQ(cfg.RabbitMQURL, logger)
	if err != nil {
		logger.Error("could not connect to RabbitMQ", "err", err)
		os.Exit(1)
	}
	defer conn.Close()

	cfgClient := configclient.New(cfg.ConfigServiceURL)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	c := consumer.New(conn, cfgClient, logger)
	if err := c.Start(ctx); err != nil {
		logger.Error("failed to start consumer", "err", err)
		os.Exit(1)
	}

	// Health endpoint
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"status":"ok"}`)
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf("0.0.0.0:%d", cfg.Port),
		Handler: mux,
	}

	go func() {
		logger.Info("delivery service listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server error", "err", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	logger.Info("SIGTERM received — shutting down")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
}

func connectRabbitMQ(url string, logger *slog.Logger) (*amqp.Connection, error) {
	for attempt := 1; attempt <= connectMaxRetries; attempt++ {
		conn, err := amqp.Dial(url)
		if err == nil {
			logger.Info("connected to RabbitMQ", "attempt", attempt)
			return conn, nil
		}

		delay := time.Duration(math.Min(float64(connectBaseDelayMs)*math.Pow(2, float64(attempt-1)), float64(connectMaxDelayMs))) * time.Millisecond
		logger.Warn("RabbitMQ connection failed — retrying", "attempt", attempt, "err", err, "backoff_ms", delay.Milliseconds())
		time.Sleep(delay)
	}
	return nil, fmt.Errorf("could not connect to RabbitMQ after %d attempts", connectMaxRetries)
}
