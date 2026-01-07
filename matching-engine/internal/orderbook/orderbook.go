package orderbook

import (
	"sync"

	"github.com/shopspring/decimal"
)

type Orderbook struct {
	Symbol   string
	Bids     *BookSide
	Asks     *BookSide
	Orders   map[string]*Order
	Sequence uint64
	mu       sync.RWMutex
}

func NewOrderbook(symbol string) *Orderbook {
	return &Orderbook{
		Symbol:   symbol,
		Bids:     NewBookSide(true),
		Asks:     NewBookSide(false),
		Orders:   make(map[string]*Order),
		Sequence: 0,
	}
}

func (ob *Orderbook) AddOrder(order *Order) {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	ob.Orders[order.ID] = order
	ob.Sequence++

	side := ob.Asks
	if order.Side == Buy {
		side = ob.Bids
	}
	side.AddOrder(order)
}

func (ob *Orderbook) RemoveOrder(orderID string) *Order {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	order, exists := ob.Orders[orderID]
	if !exists {
		return nil
	}

	delete(ob.Orders, orderID)
	ob.Sequence++

	side := ob.Asks
	if order.Side == Buy {
		side = ob.Bids
	}
	side.RemoveOrder(order.Price, orderID)

	return order
}

func (ob *Orderbook) GetOrder(orderID string) *Order {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.Orders[orderID]
}

func (ob *Orderbook) BestBid() *PriceLevel {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.Bids.Best()
}

func (ob *Orderbook) BestAsk() *PriceLevel {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.Asks.Best()
}

func (ob *Orderbook) GetDepth(limit int) (bids, asks [][2]string) {
	ob.mu.RLock()
	defer ob.mu.RUnlock()

	bids = ob.Bids.GetLevels(limit)
	asks = ob.Asks.GetLevels(limit)
	return
}

func (ob *Orderbook) GetSequence() uint64 {
	ob.mu.RLock()
	defer ob.mu.RUnlock()
	return ob.Sequence
}

type BookSide struct {
	levels    map[string]*PriceLevel
	sorted    []decimal.Decimal
	isDescend bool
}

func NewBookSide(isDescend bool) *BookSide {
	return &BookSide{
		levels:    make(map[string]*PriceLevel),
		sorted:    make([]decimal.Decimal, 0),
		isDescend: isDescend,
	}
}

func (bs *BookSide) AddOrder(order *Order) {
	priceStr := order.Price.String()
	level, exists := bs.levels[priceStr]

	if !exists {
		level = NewPriceLevel(order.Price)
		bs.levels[priceStr] = level
		bs.insertPrice(order.Price)
	}

	level.AddOrder(order)
}

func (bs *BookSide) RemoveOrder(price decimal.Decimal, orderID string) *Order {
	priceStr := price.String()
	level, exists := bs.levels[priceStr]
	if !exists {
		return nil
	}

	order := level.RemoveOrder(orderID)

	if level.IsEmpty() {
		delete(bs.levels, priceStr)
		bs.removePrice(price)
	}

	return order
}

func (bs *BookSide) Best() *PriceLevel {
	if len(bs.sorted) == 0 {
		return nil
	}
	return bs.levels[bs.sorted[0].String()]
}

func (bs *BookSide) GetLevel(price string) *PriceLevel {
	return bs.levels[price]
}

func (bs *BookSide) GetLevels(limit int) [][2]string {
	result := make([][2]string, 0, min(limit, len(bs.sorted)))

	for i := 0; i < len(bs.sorted) && i < limit; i++ {
		price := bs.sorted[i]
		level := bs.levels[price.String()]
		result = append(result, [2]string{price.String(), level.Volume.String()})
	}

	return result
}

func (bs *BookSide) insertPrice(price decimal.Decimal) {
	idx := bs.findInsertIndex(price)
	bs.sorted = append(bs.sorted, decimal.Zero)
	copy(bs.sorted[idx+1:], bs.sorted[idx:])
	bs.sorted[idx] = price
}

func (bs *BookSide) removePrice(price decimal.Decimal) {
	for i, p := range bs.sorted {
		if p.Equal(price) {
			bs.sorted = append(bs.sorted[:i], bs.sorted[i+1:]...)
			return
		}
	}
}

func (bs *BookSide) findInsertIndex(price decimal.Decimal) int {
	for i, p := range bs.sorted {
		if bs.isDescend {
			if price.GreaterThan(p) {
				return i
			}
		} else {
			if price.LessThan(p) {
				return i
			}
		}
	}
	return len(bs.sorted)
}

func (bs *BookSide) UpdateLevelVolume(price decimal.Decimal, delta decimal.Decimal) {
	priceStr := price.String()
	if level, exists := bs.levels[priceStr]; exists {
		level.UpdateVolume(delta)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
