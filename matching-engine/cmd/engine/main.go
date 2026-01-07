package main

import (
	"context"
	"encoding/json"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/opencode-exchange/matching-engine/internal/kafka"
	"github.com/opencode-exchange/matching-engine/internal/matcher"
	"github.com/opencode-exchange/matching-engine/internal/orderbook"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")

	m := matcher.NewMatcher()
	producer := kafka.NewProducer(brokers, logger)
	defer producer.Close()

	handler := func(cmd *kafka.OrderCommand) error {
		logger.Info("Processing command",
			zap.String("type", cmd.Type),
			zap.String("orderId", cmd.OrderID),
			zap.String("symbol", cmd.Symbol))

		ctx := context.Background()

		switch cmd.Type {
		case "NEW":
			payloadBytes, _ := json.Marshal(cmd.Payload)
			var payload kafka.NewOrderPayload
			if err := json.Unmarshal(payloadBytes, &payload); err != nil {
				logger.Error("Failed to parse payload", zap.Error(err))
				return err
			}

			side := orderbook.Buy
			if payload.Side == "SELL" {
				side = orderbook.Sell
			}

			orderType := orderbook.Limit
			if payload.OrderType == "MARKET" {
				orderType = orderbook.Market
			}

			price := decimal.Zero
			if payload.Price != nil {
				price, _ = decimal.NewFromString(*payload.Price)
			}

			quantity, _ := decimal.NewFromString(payload.Quantity)

			order := orderbook.NewOrder(
				cmd.OrderID,
				cmd.UserID,
				cmd.Symbol,
				side,
				orderType,
				price,
				quantity,
			)

			result := m.ProcessOrder(order)

			trades := make([]*kafka.TradeEvent, len(result.Trades))
			for i, t := range result.Trades {
				trades[i] = &kafka.TradeEvent{
					TradeID:      t.ID,
					Symbol:       t.Symbol,
					Price:        t.Price.String(),
					Quantity:     t.Quantity.String(),
					QuoteQty:     t.QuoteQty.String(),
					MakerOrderID: t.MakerOrderID,
					TakerOrderID: t.TakerOrderID,
					MakerUserID:  t.MakerUserID,
					TakerUserID:  t.TakerUserID,
					IsBuyerMaker: t.IsBuyerMaker,
					MakerFee:     "0",
					TakerFee:     "0",
					ExecutedAt:   t.ExecutedAt.UnixMilli(),
				}
			}

			if len(trades) > 0 {
				if err := producer.PublishTrades(ctx, trades); err != nil {
					logger.Error("Failed to publish trades", zap.Error(err))
					return err
				}
				logger.Info("Published trades", zap.Int("count", len(trades)))
			}

			if result.OrderbookDelta != nil && (len(result.OrderbookDelta.Bids) > 0 || len(result.OrderbookDelta.Asks) > 0) {
				update := &kafka.OrderbookUpdateEvent{
					Symbol:    result.OrderbookDelta.Symbol,
					Sequence:  result.OrderbookDelta.Sequence,
					Bids:      result.OrderbookDelta.Bids,
					Asks:      result.OrderbookDelta.Asks,
					Timestamp: result.OrderbookDelta.Timestamp,
				}
				if err := producer.PublishOrderbookUpdate(ctx, update); err != nil {
					logger.Error("Failed to publish orderbook update", zap.Error(err))
					return err
				}
			}

		case "CANCEL":
			cancelledOrder, delta := m.CancelOrder(cmd.Symbol, cmd.OrderID)
			if cancelledOrder != nil {
				logger.Info("Order cancelled", zap.String("orderId", cmd.OrderID))

				if delta != nil {
					update := &kafka.OrderbookUpdateEvent{
						Symbol:    delta.Symbol,
						Sequence:  delta.Sequence,
						Bids:      delta.Bids,
						Asks:      delta.Asks,
						Timestamp: delta.Timestamp,
					}
					if err := producer.PublishOrderbookUpdate(ctx, update); err != nil {
						logger.Error("Failed to publish orderbook update", zap.Error(err))
						return err
					}
				}
			}
		}

		return nil
	}

	consumer := kafka.NewConsumer(brokers, "orders", "matching-engine", handler, logger)
	defer consumer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		logger.Info("Shutting down...")
		cancel()
	}()

	logger.Info("Matching engine started")
	if err := consumer.Start(ctx); err != nil && err != context.Canceled {
		logger.Fatal("Consumer error", zap.Error(err))
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
