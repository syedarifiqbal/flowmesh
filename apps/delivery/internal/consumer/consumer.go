package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/sony/gobreaker"

	"github.com/flowmesh/delivery/internal/configclient"
	"github.com/flowmesh/delivery/internal/destination"
	"github.com/flowmesh/delivery/internal/store"
)

const (
	deliveryExchange = "pipeline.events"
	deliveryQueue    = "delivery.queue"
	deliveryRouting  = "delivery.event"
	dlqExchange      = "flowmesh.dlq"
	dlqRouting       = "dead.delivery"

	maxRetries  = 5
	baseDelayMs = 500
	maxDelayMs  = 30000
)

type fanoutMeta struct {
	MessageID     string `json:"messageId"`
	ExecutionID   string `json:"executionId"`
	DestinationID string `json:"destinationId"`
	WorkspaceID   string `json:"workspaceId"`
	DLQEventID    string `json:"dlqEventId,omitempty"`
}

type fanoutMessage struct {
	Meta  fanoutMeta     `json:"meta"`
	Event map[string]any `json:"event"`
}

// acker abstracts amqp.Delivery's Ack/Nack so the core logic is testable
// without a real broker connection.
type acker interface {
	Ack(multiple bool) error
	Nack(multiple, requeue bool) error
}

// DLQWriter is satisfied by *store.DLQStore.
type DLQWriter interface {
	Write(ctx context.Context, e store.DLQEvent) error
	MarkResolved(ctx context.Context, id string) error
}

// AttemptsWriter is satisfied by *store.AttemptsStore.
type AttemptsWriter interface {
	Write(ctx context.Context, a store.DeliveryAttempt) error
}

type Consumer struct {
	conn           *amqp.Connection
	configClient   *configclient.Client
	dlqWriter      DLQWriter
	attemptsWriter AttemptsWriter
	breakers       map[string]*gobreaker.CircuitBreaker
	logger         *slog.Logger
	shuttingDown   bool
}

func New(conn *amqp.Connection, cfgClient *configclient.Client, dlqWriter DLQWriter, attemptsWriter AttemptsWriter, logger *slog.Logger) *Consumer {
	return &Consumer{
		conn:           conn,
		configClient:   cfgClient,
		dlqWriter:      dlqWriter,
		attemptsWriter: attemptsWriter,
		breakers:       make(map[string]*gobreaker.CircuitBreaker),
		logger:         logger,
	}
}

func (c *Consumer) Start(ctx context.Context) error {
	ch, err := c.setupChannel()
	if err != nil {
		return fmt.Errorf("setup channel: %w", err)
	}

	msgs, err := ch.Consume(deliveryQueue, "", false, false, false, false, nil)
	if err != nil {
		return fmt.Errorf("start consume: %w", err)
	}

	c.logger.Info("delivery consumer ready", "queue", deliveryQueue)

	go func() {
		for {
			select {
			case <-ctx.Done():
				c.shuttingDown = true
				ch.Close()
				return
			case msg, ok := <-msgs:
				if !ok {
					if c.shuttingDown {
						return
					}
					c.logger.Warn("delivery channel closed — reconnecting")
					ch, msgs = c.reconnect(ctx)
					continue
				}
				c.processDelivery(ctx, &msg)
			}
		}
	}()

	return nil
}

// processDelivery wraps an amqp.Delivery and calls the testable core logic.
func (c *Consumer) processDelivery(ctx context.Context, msg *amqp.Delivery) {
	c.handleMessageInternal(ctx, msg, msg.Body)
}

// handleMessageInternal contains all message-handling logic. It accepts an
// acker interface so it can be unit-tested without a real AMQP broker.
func (c *Consumer) handleMessageInternal(ctx context.Context, a acker, body []byte) {
	var fm fanoutMessage
	if err := json.Unmarshal(body, &fm); err != nil {
		c.logger.Error("unparseable delivery message — sending to DLQ", "err", err)
		a.Nack(false, false) //nolint:errcheck
		return
	}

	correlationId, _ := fm.Event["correlationId"].(string)
	log := c.logger.With(
		"messageId", fm.Meta.MessageID,
		"correlationId", correlationId,
		"destinationId", fm.Meta.DestinationID,
		"workspaceId", fm.Meta.WorkspaceID,
	)

	dest, err := c.configClient.GetDestination(ctx, fm.Meta.WorkspaceID, fm.Meta.DestinationID)
	if err != nil {
		log.Error("failed to fetch destination config", "err", err)
		a.Nack(false, false) //nolint:errcheck
		return
	}

	cb := c.breakerFor(fm.Meta.DestinationID, dest.Type)

	eventID, _ := fm.Event["eventId"].(string)
	eventName, _ := fm.Event["eventName"].(string)
	src, _ := fm.Event["source"].(string)

	var deliverErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		start := time.Now()
		_, deliverErr = cb.Execute(func() (any, error) {
			return nil, destination.Dispatch(ctx, dest.Type, dest.Config, fm.Event)
		})
		durationMs := time.Since(start).Milliseconds()

		if deliverErr == nil {
			log.Info("event delivered", "type", dest.Type, "attempt", attempt)
			c.writeAttempt(ctx, fm, dest.Type, eventID, correlationId, attempt, durationMs, "")

			if c.dlqWriter != nil && fm.Meta.DLQEventID != "" {
				if err := c.dlqWriter.MarkResolved(ctx, fm.Meta.DLQEventID); err != nil {
					log.Warn("failed to mark DLQ event resolved", "err", err, "dlqEventId", fm.Meta.DLQEventID)
				}
			}

			a.Ack(false) //nolint:errcheck
			return
		}

		c.writeAttempt(ctx, fm, dest.Type, eventID, correlationId, attempt, durationMs, deliverErr.Error())

		if attempt < maxRetries {
			delay := time.Duration(math.Min(float64(baseDelayMs)*math.Pow(2, float64(attempt-1)), float64(maxDelayMs))) * time.Millisecond
			log.Warn("delivery attempt failed — retrying", "attempt", attempt, "err", deliverErr, "backoff_ms", delay.Milliseconds())
			select {
			case <-ctx.Done():
				a.Nack(false, true) //nolint:errcheck
				return
			case <-time.After(delay):
			}
		}
	}

	log.Error("max retries exceeded — routing to DLQ", "err", deliverErr, "type", dest.Type)

	// Store the full message body so replay re-publishes a valid fanoutMessage.
	fullPayload := make([]byte, len(body))
	copy(fullPayload, body)

	if c.dlqWriter != nil {
		if err := c.dlqWriter.Write(ctx, store.DLQEvent{
			WorkspaceID:     fm.Meta.WorkspaceID,
			EventID:         eventID,
			CorrelationID:   correlationId,
			EventName:       eventName,
			Source:          src,
			DestinationID:   fm.Meta.DestinationID,
			DestinationType: dest.Type,
			Payload:         json.RawMessage(fullPayload),
			ErrorReason:     deliverErr.Error(),
			Attempts:        maxRetries,
		}); err != nil {
			log.Error("failed to persist DLQ event", "err", err)
		}
	}

	a.Nack(false, false) //nolint:errcheck
}

func (c *Consumer) writeAttempt(ctx context.Context, fm fanoutMessage, destType, eventID, correlationID string, attempt int, durationMs int64, errMsg string) {
	if c.attemptsWriter == nil {
		return
	}
	outcome := "success"
	if errMsg != "" {
		outcome = "failure"
	}
	if err := c.attemptsWriter.Write(ctx, store.DeliveryAttempt{
		WorkspaceID:     fm.Meta.WorkspaceID,
		EventID:         eventID,
		CorrelationID:   correlationID,
		DestinationID:   fm.Meta.DestinationID,
		DestinationType: destType,
		Attempt:         attempt,
		Outcome:         outcome,
		Error:           errMsg,
		DurationMs:      durationMs,
	}); err != nil {
		c.logger.Warn("failed to persist delivery attempt", "err", err)
	}
}

func (c *Consumer) setupChannel() (*amqp.Channel, error) {
	ch, err := c.conn.Channel()
	if err != nil {
		return nil, err
	}

	if err := ch.ExchangeDeclare(deliveryExchange, "topic", true, false, false, false, nil); err != nil {
		return nil, fmt.Errorf("declare delivery exchange: %w", err)
	}

	if err := ch.ExchangeDeclare(dlqExchange, "topic", true, false, false, false, nil); err != nil {
		return nil, fmt.Errorf("declare dlq exchange: %w", err)
	}

	args := amqp.Table{
		"x-dead-letter-exchange":    dlqExchange,
		"x-dead-letter-routing-key": dlqRouting,
	}
	if _, err := ch.QueueDeclare(deliveryQueue, true, false, false, false, args); err != nil {
		return nil, fmt.Errorf("declare delivery queue: %w", err)
	}

	if err := ch.QueueBind(deliveryQueue, deliveryRouting, deliveryExchange, false, nil); err != nil {
		return nil, fmt.Errorf("bind delivery queue: %w", err)
	}

	if err := ch.Qos(10, 0, false); err != nil {
		return nil, fmt.Errorf("set qos: %w", err)
	}

	return ch, nil
}

func (c *Consumer) reconnect(ctx context.Context) (*amqp.Channel, <-chan amqp.Delivery) {
	for attempt := 0; ; attempt++ {
		select {
		case <-ctx.Done():
			return nil, nil
		default:
		}

		delay := time.Duration(math.Min(float64(baseDelayMs)*math.Pow(2, float64(attempt)), float64(maxDelayMs))) * time.Millisecond
		time.Sleep(delay)

		ch, err := c.setupChannel()
		if err != nil {
			c.logger.Warn("channel reconnect failed", "attempt", attempt+1, "err", err)
			continue
		}

		msgs, err := ch.Consume(deliveryQueue, "", false, false, false, false, nil)
		if err != nil {
			c.logger.Warn("re-consume failed", "attempt", attempt+1, "err", err)
			ch.Close()
			continue
		}

		c.logger.Info("delivery channel reconnected")
		return ch, msgs
	}
}

func (c *Consumer) breakerFor(destinationID, destType string) *gobreaker.CircuitBreaker {
	key := destType + ":" + destinationID
	if cb, ok := c.breakers[key]; ok {
		return cb
	}

	cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        key,
		MaxRequests: 1,
		Interval:    60 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
		OnStateChange: func(name string, from, to gobreaker.State) {
			c.logger.Warn("circuit breaker state change", "destination", name, "from", from.String(), "to", to.String())
		},
	})

	c.breakers[key] = cb
	return cb
}
