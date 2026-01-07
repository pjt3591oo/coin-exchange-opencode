package orderbook

import (
	"time"

	"github.com/shopspring/decimal"
)

type Side int

const (
	Buy Side = iota
	Sell
)

func (s Side) String() string {
	if s == Buy {
		return "BUY"
	}
	return "SELL"
}

type OrderType int

const (
	Limit OrderType = iota
	Market
)

type Order struct {
	ID           string
	UserID       string
	Symbol       string
	Side         Side
	Type         OrderType
	Price        decimal.Decimal
	Quantity     decimal.Decimal
	RemainingQty decimal.Decimal
	Timestamp    time.Time
}

func NewOrder(id, userID, symbol string, side Side, orderType OrderType, price, quantity decimal.Decimal) *Order {
	return &Order{
		ID:           id,
		UserID:       userID,
		Symbol:       symbol,
		Side:         side,
		Type:         orderType,
		Price:        price,
		Quantity:     quantity,
		RemainingQty: quantity,
		Timestamp:    time.Now(),
	}
}

func (o *Order) IsFilled() bool {
	return o.RemainingQty.IsZero()
}

func (o *Order) Fill(qty decimal.Decimal) decimal.Decimal {
	if qty.GreaterThan(o.RemainingQty) {
		qty = o.RemainingQty
	}
	o.RemainingQty = o.RemainingQty.Sub(qty)
	return qty
}
