'use client';

import { useMarketStore } from '@/store';
import { memo } from 'react';
import { format } from 'date-fns';

const TradeRow = ({ price, quantity, time, side }: { price: number; quantity: number; time: number; side: string }) => {
  const isBuy = side.toUpperCase() === 'BUY';
  
  return (
    <div className="flex justify-between text-xs py-0.5 hover:bg-white/5">
      <span className={isBuy ? 'text-success' : 'text-danger'}>
        {price.toFixed(2)}
      </span>
      <span className="text-text-secondary">{quantity.toFixed(4)}</span>
      <span className="text-text-secondary text-right">
        {format(time, 'HH:mm:ss')}
      </span>
    </div>
  );
};

const TradeHistory = () => {
  const recentTrades = useMarketStore((s) => s.recentTrades);

  return (
    <div className="flex flex-col h-full bg-surface border border-border rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold text-text-secondary flex justify-between">
        <span>Price(USDT)</span>
        <span>Amount</span>
        <span>Time</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-1">
        {recentTrades.length === 0 ? (
          <div className="text-center text-text-secondary text-xs py-4">No trades yet</div>
        ) : (
          recentTrades.map((trade) => (
            <TradeRow
              key={trade.id}
              price={trade.price}
              quantity={trade.quantity}
              time={trade.timestamp}
              side={trade.side}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default memo(TradeHistory);
