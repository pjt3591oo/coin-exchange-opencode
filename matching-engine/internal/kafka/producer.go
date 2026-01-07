package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Producer struct {
	tradeWriter     *kafka.Writer
	orderbookWriter *kafka.Writer
	logger          *zap.Logger
}

func NewProducer(brokers []string, logger *zap.Logger) *Producer {
	tradeWriter := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Topic:        "trades",
		Balancer:     &kafka.Hash{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}

	orderbookWriter := &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Topic:        "orderbook-updates",
		Balancer:     &kafka.Hash{},
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}

	return &Producer{
		tradeWriter:     tradeWriter,
		orderbookWriter: orderbookWriter,
		logger:          logger,
	}
}

type TradeEvent struct {
	TradeID      string `json:"tradeId"`
	Symbol       string `json:"symbol"`
	Price        string `json:"price"`
	Quantity     string `json:"quantity"`
	QuoteQty     string `json:"quoteQty"`
	MakerOrderID string `json:"makerOrderId"`
	TakerOrderID string `json:"takerOrderId"`
	MakerUserID  string `json:"makerUserId"`
	TakerUserID  string `json:"takerUserId"`
	IsBuyerMaker bool   `json:"isBuyerMaker"`
	MakerFee     string `json:"makerFee"`
	TakerFee     string `json:"takerFee"`
	ExecutedAt   int64  `json:"executedAt"`
}

type OrderbookUpdateEvent struct {
	Symbol    string      `json:"symbol"`
	Sequence  uint64      `json:"sequence"`
	Bids      [][2]string `json:"bids"`
	Asks      [][2]string `json:"asks"`
	Timestamp int64       `json:"timestamp"`
}

func (p *Producer) PublishTrade(ctx context.Context, trade *TradeEvent) error {
	value, err := json.Marshal(trade)
	if err != nil {
		return err
	}

	return p.tradeWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(trade.Symbol),
		Value: value,
	})
}

func (p *Producer) PublishTrades(ctx context.Context, trades []*TradeEvent) error {
	if len(trades) == 0 {
		return nil
	}

	messages := make([]kafka.Message, len(trades))
	for i, trade := range trades {
		value, err := json.Marshal(trade)
		if err != nil {
			return err
		}
		messages[i] = kafka.Message{
			Key:   []byte(trade.Symbol),
			Value: value,
		}
	}

	return p.tradeWriter.WriteMessages(ctx, messages...)
}

func (p *Producer) PublishOrderbookUpdate(ctx context.Context, update *OrderbookUpdateEvent) error {
	value, err := json.Marshal(update)
	if err != nil {
		return err
	}

	return p.orderbookWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(update.Symbol),
		Value: value,
	})
}

func (p *Producer) Close() error {
	if err := p.tradeWriter.Close(); err != nil {
		return err
	}
	return p.orderbookWriter.Close()
}
