'use client';

import { useMarketStore } from '@/store';
import { useMemo } from 'react';

const OrderRow = ({ price, quantity, total, maxTotal, type, onClick }: { price: number; quantity: number; total: number; maxTotal: number; type: 'bid' | 'ask'; onClick: () => void }) => {
  const width = `${Math.min((total / maxTotal) * 100, 100)}%`;
  const bgClass = type === 'bid' ? 'bg-success/10' : 'bg-danger/10';
  const textClass = type === 'bid' ? 'text-success' : 'text-danger';

  return (
    <div 
      className="relative flex justify-between text-xs py-0.5 hover:bg-white/5 cursor-pointer group"
      onClick={onClick}
    >
      <div
        className={`absolute top-0 bottom-0 ${type === 'bid' ? 'right-0' : 'left-0'} ${bgClass}`}
        style={{ width }}
      />
      <span className={`z-10 relative pl-2 ${textClass}`}>{price.toFixed(2)}</span>
      <span className="z-10 relative text-text-secondary">{quantity.toFixed(4)}</span>
      <span className="z-10 relative pr-2 text-text-secondary">{total.toFixed(2)}</span>
    </div>
  );
};

export default function Orderbook() {
  const orderbook = useMarketStore((s) => s.orderbook);
  const setSelectedOrder = useMarketStore((s) => s.setSelectedOrder);

  const { bids, asks, maxTotal, isEmpty } = useMemo(() => {
    const processedBids = orderbook.bids.slice(0, 15);
    const processedAsks = orderbook.asks.slice(0, 15);

    const bidMax = Math.max(...processedBids.map(b => b.total), 1);
    const askMax = Math.max(...processedAsks.map(a => a.total), 1);
    
    return {
      bids: processedBids,
      asks: processedAsks,
      maxTotal: Math.max(bidMax, askMax),
      isEmpty: processedBids.length === 0 && processedAsks.length === 0
    };
  }, [orderbook]);

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold text-text-secondary flex justify-between">
        <span>Price(USDT)</span>
        <span>Amount</span>
        <span>Total</span>
      </div>
      
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
          No orders in orderbook
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col-reverse">
            {[...asks].reverse().map((ask, i) => (
              <OrderRow
                key={`ask-${i}`}
                price={ask.price}
                quantity={ask.quantity}
                total={ask.total}
                maxTotal={maxTotal}
                type="ask"
                onClick={() => setSelectedOrder(ask.price, 'buy')}
              />
            ))}
          </div>

          <div className="h-px bg-border my-1 mx-2" />

          <div className="flex-1 overflow-hidden">
            {bids.map((bid, i) => (
              <OrderRow
                key={`bid-${i}`}
                price={bid.price}
                quantity={bid.quantity}
                total={bid.total}
                maxTotal={maxTotal}
                type="bid"
                onClick={() => setSelectedOrder(bid.price, 'sell')}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
