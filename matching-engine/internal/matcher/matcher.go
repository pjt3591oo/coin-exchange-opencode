package matcher

import (
	"time"

	"github.com/google/uuid"
	"github.com/opencode-exchange/matching-engine/internal/orderbook"
	"github.com/shopspring/decimal"
)

type Trade struct {
	ID           string
	Symbol       string
	Price        decimal.Decimal
	Quantity     decimal.Decimal
	QuoteQty     decimal.Decimal
	MakerOrderID string
	TakerOrderID string
	MakerUserID  string
	TakerUserID  string
	IsBuyerMaker bool
	ExecutedAt   time.Time
}

type OrderUpdate struct {
	OrderID      string
	RemainingQty decimal.Decimal
	Status       string
}

type MatchResult struct {
	Trades       []*Trade
	OrderUpdates []*OrderUpdate
	OrderbookDelta *OrderbookDelta
}

type OrderbookDelta struct {
	Symbol    string
	Sequence  uint64
	Bids      [][2]string
	Asks      [][2]string
	Timestamp int64
}

type Matcher struct {
	orderbooks map[string]*orderbook.Orderbook
}

func NewMatcher() *Matcher {
	return &Matcher{
		orderbooks: make(map[string]*orderbook.Orderbook),
	}
}

func (m *Matcher) GetOrCreateOrderbook(symbol string) *orderbook.Orderbook {
	ob, exists := m.orderbooks[symbol]
	if !exists {
		ob = orderbook.NewOrderbook(symbol)
		m.orderbooks[symbol] = ob
	}
	return ob
}

func (m *Matcher) ProcessOrder(order *orderbook.Order) *MatchResult {
	ob := m.GetOrCreateOrderbook(order.Symbol)
	result := &MatchResult{
		Trades:       make([]*Trade, 0),
		OrderUpdates: make([]*OrderUpdate, 0),
	}

	if order.Type == orderbook.Market && order.Side == orderbook.Buy {
		order.Price = decimal.NewFromInt(999999999)
	} else if order.Type == orderbook.Market && order.Side == orderbook.Sell {
		order.Price = decimal.Zero
	}

	var oppositeSide *orderbook.BookSide
	var priceMatches func(makerPrice, takerPrice decimal.Decimal) bool

	if order.Side == orderbook.Buy {
		oppositeSide = ob.Asks
		priceMatches = func(makerPrice, takerPrice decimal.Decimal) bool {
			return makerPrice.LessThanOrEqual(takerPrice)
		}
	} else {
		oppositeSide = ob.Bids
		priceMatches = func(makerPrice, takerPrice decimal.Decimal) bool {
			return makerPrice.GreaterThanOrEqual(takerPrice)
		}
	}

	bidDeltas := make(map[string]decimal.Decimal)
	askDeltas := make(map[string]decimal.Decimal)

	for !order.IsFilled() {
		bestLevel := oppositeSide.Best()
		if bestLevel == nil {
			break
		}

		if !priceMatches(bestLevel.Price, order.Price) {
			break
		}

		for !order.IsFilled() && !bestLevel.IsEmpty() {
			makerOrder := bestLevel.Front()
			if makerOrder == nil {
				break
			}

			tradeQty := order.RemainingQty
			if makerOrder.RemainingQty.LessThan(tradeQty) {
				tradeQty = makerOrder.RemainingQty
			}

			tradePrice := makerOrder.Price
			quoteQty := tradePrice.Mul(tradeQty)

			trade := &Trade{
				ID:           uuid.New().String(),
				Symbol:       order.Symbol,
				Price:        tradePrice,
				Quantity:     tradeQty,
				QuoteQty:     quoteQty,
				MakerOrderID: makerOrder.ID,
				TakerOrderID: order.ID,
				MakerUserID:  makerOrder.UserID,
				TakerUserID:  order.UserID,
				IsBuyerMaker: makerOrder.Side == orderbook.Buy,
				ExecutedAt:   time.Now(),
			}
			result.Trades = append(result.Trades, trade)

			makerOrder.Fill(tradeQty)
			order.Fill(tradeQty)

			makerStatus := "PARTIAL"
			if makerOrder.IsFilled() {
				makerStatus = "FILLED"
				ob.RemoveOrder(makerOrder.ID)
			} else {
				bestLevel.UpdateVolume(tradeQty.Neg())
			}

			result.OrderUpdates = append(result.OrderUpdates, &OrderUpdate{
				OrderID:      makerOrder.ID,
				RemainingQty: makerOrder.RemainingQty,
				Status:       makerStatus,
			})

			if order.Side == orderbook.Buy {
				askDeltas[tradePrice.String()] = askDeltas[tradePrice.String()].Sub(tradeQty)
			} else {
				bidDeltas[tradePrice.String()] = bidDeltas[tradePrice.String()].Sub(tradeQty)
			}
		}
	}

	takerStatus := "FILLED"
	if !order.IsFilled() {
		if order.Type == orderbook.Limit {
			ob.AddOrder(order)
			takerStatus = "NEW"
			if len(result.Trades) > 0 {
				takerStatus = "PARTIAL"
			}

			if order.Side == orderbook.Buy {
				bidDeltas[order.Price.String()] = bidDeltas[order.Price.String()].Add(order.RemainingQty)
			} else {
				askDeltas[order.Price.String()] = askDeltas[order.Price.String()].Add(order.RemainingQty)
			}
		} else {
			if len(result.Trades) > 0 {
				takerStatus = "PARTIAL"
			} else {
				takerStatus = "CANCELLED"
			}
		}
	}

	result.OrderUpdates = append(result.OrderUpdates, &OrderUpdate{
		OrderID:      order.ID,
		RemainingQty: order.RemainingQty,
		Status:       takerStatus,
	})

	bids := make([][2]string, 0, len(bidDeltas))
	for price := range bidDeltas {
		if level := ob.Bids.GetLevel(price); level != nil {
			bids = append(bids, [2]string{price, level.Volume.String()})
		} else {
			bids = append(bids, [2]string{price, "0"})
		}
	}

	asks := make([][2]string, 0, len(askDeltas))
	for price := range askDeltas {
		if level := ob.Asks.GetLevel(price); level != nil {
			asks = append(asks, [2]string{price, level.Volume.String()})
		} else {
			asks = append(asks, [2]string{price, "0"})
		}
	}

	result.OrderbookDelta = &OrderbookDelta{
		Symbol:    order.Symbol,
		Sequence:  ob.GetSequence(),
		Bids:      bids,
		Asks:      asks,
		Timestamp: time.Now().UnixMilli(),
	}

	return result
}

func (m *Matcher) CancelOrder(symbol, orderID string) (*orderbook.Order, *OrderbookDelta) {
	ob, exists := m.orderbooks[symbol]
	if !exists {
		return nil, nil
	}

	order := ob.RemoveOrder(orderID)
	if order == nil {
		return nil, nil
	}

	var bids, asks [][2]string
	if order.Side == orderbook.Buy {
		bids = [][2]string{{order.Price.String(), "0"}}
		if level := ob.Bids.Best(); level != nil && level.Price.Equal(order.Price) {
			bids = [][2]string{{order.Price.String(), level.Volume.String()}}
		}
	} else {
		asks = [][2]string{{order.Price.String(), "0"}}
		if level := ob.Asks.Best(); level != nil && level.Price.Equal(order.Price) {
			asks = [][2]string{{order.Price.String(), level.Volume.String()}}
		}
	}

	return order, &OrderbookDelta{
		Symbol:    symbol,
		Sequence:  ob.GetSequence(),
		Bids:      bids,
		Asks:      asks,
		Timestamp: time.Now().UnixMilli(),
	}
}

func (m *Matcher) GetOrderbook(symbol string) *orderbook.Orderbook {
	return m.orderbooks[symbol]
}
