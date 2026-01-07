package orderbook

import (
	"container/list"

	"github.com/shopspring/decimal"
)

type PriceLevel struct {
	Price    decimal.Decimal
	Orders   *list.List
	Volume   decimal.Decimal
	elements map[string]*list.Element
}

func NewPriceLevel(price decimal.Decimal) *PriceLevel {
	return &PriceLevel{
		Price:    price,
		Orders:   list.New(),
		Volume:   decimal.Zero,
		elements: make(map[string]*list.Element),
	}
}

func (pl *PriceLevel) AddOrder(order *Order) {
	elem := pl.Orders.PushBack(order)
	pl.elements[order.ID] = elem
	pl.Volume = pl.Volume.Add(order.RemainingQty)
}

func (pl *PriceLevel) RemoveOrder(orderID string) *Order {
	elem, exists := pl.elements[orderID]
	if !exists {
		return nil
	}

	order := elem.Value.(*Order)
	pl.Orders.Remove(elem)
	delete(pl.elements, orderID)
	pl.Volume = pl.Volume.Sub(order.RemainingQty)

	return order
}

func (pl *PriceLevel) UpdateVolume(delta decimal.Decimal) {
	pl.Volume = pl.Volume.Add(delta)
}

func (pl *PriceLevel) Front() *Order {
	if pl.Orders.Len() == 0 {
		return nil
	}
	return pl.Orders.Front().Value.(*Order)
}

func (pl *PriceLevel) IsEmpty() bool {
	return pl.Orders.Len() == 0
}

func (pl *PriceLevel) Len() int {
	return pl.Orders.Len()
}
