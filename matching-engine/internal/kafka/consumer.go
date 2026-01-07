package kafka

import (
	"context"
	"encoding/json"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type OrderCommand struct {
	CommandID string      `json:"commandId"`
	OrderID   string      `json:"orderId"`
	UserID    string      `json:"userId"`
	Symbol    string      `json:"symbol"`
	Type      string      `json:"type"`
	Timestamp int64       `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

type NewOrderPayload struct {
	Side          string  `json:"side"`
	OrderType     string  `json:"orderType"`
	Price         *string `json:"price"`
	Quantity      string  `json:"quantity"`
	ClientOrderID *string `json:"clientOrderId"`
}

type Consumer struct {
	reader  *kafka.Reader
	handler func(cmd *OrderCommand) error
	logger  *zap.Logger
}

func NewConsumer(brokers []string, topic, groupID string, handler func(cmd *OrderCommand) error, logger *zap.Logger) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})

	return &Consumer{
		reader:  reader,
		handler: handler,
		logger:  logger,
	}
}

func (c *Consumer) Start(ctx context.Context) error {
	c.logger.Info("Starting Kafka consumer")

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := c.reader.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				c.logger.Error("Failed to fetch message", zap.Error(err))
				continue
			}

			var cmd OrderCommand
			if err := json.Unmarshal(msg.Value, &cmd); err != nil {
				c.logger.Error("Failed to unmarshal message", zap.Error(err))
				if err := c.reader.CommitMessages(ctx, msg); err != nil {
					c.logger.Error("Failed to commit message", zap.Error(err))
				}
				continue
			}

			if err := c.handler(&cmd); err != nil {
				c.logger.Error("Failed to process command",
					zap.String("commandId", cmd.CommandID),
					zap.Error(err))
			}

			if err := c.reader.CommitMessages(ctx, msg); err != nil {
				c.logger.Error("Failed to commit message", zap.Error(err))
			}
		}
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}
