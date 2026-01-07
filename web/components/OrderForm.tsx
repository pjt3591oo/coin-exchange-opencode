'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { useMarketStore } from '@/store';

export default function OrderForm() {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const { isAuthenticated, user, balances } = useAuth();
  const currentSymbol = useMarketStore((s) => s.currentSymbol);
  const selectedPrice = useMarketStore((s) => s.selectedPrice);
  const selectedSide = useMarketStore((s) => s.selectedSide);
  const clearSelectedOrder = useMarketStore((s) => s.clearSelectedOrder);

  useEffect(() => {
    if (selectedPrice !== null) {
      setPrice(selectedPrice.toString());
      if (selectedSide) {
        setSide(selectedSide);
      }
      clearSelectedOrder();
    }
  }, [selectedPrice, selectedSide, clearSelectedOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;

    try {
      await api.post('/orders', {
        symbol: currentSymbol,
        side: side.toUpperCase(),
        type: type.toUpperCase(),
        price: type === 'limit' ? price : undefined,
        quantity,
      });
      setQuantity('');
    } catch (error) {
      console.error('Order failed', error);
    }
  };

  const total = parseFloat(price) * parseFloat(quantity);
  const asset = side === 'buy' ? 'USDT' : 'BTC';
  const balance = balances?.[asset]?.available || 0;

  return (
    <div className="bg-surface border border-border rounded-sm p-4">
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-2 text-sm font-semibold rounded ${
            side === 'buy' ? 'bg-success text-white' : 'bg-background text-text-secondary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-2 text-sm font-semibold rounded ${
            side === 'sell' ? 'bg-danger text-white' : 'bg-background text-text-secondary'
          }`}
        >
          Sell
        </button>
      </div>

      <div className="flex space-x-4 mb-4 text-xs font-semibold text-text-secondary">
        <button
          onClick={() => setType('limit')}
          className={type === 'limit' ? 'text-primary' : ''}
        >
          Limit
        </button>
        <button
          onClick={() => setType('market')}
          className={type === 'market' ? 'text-primary' : ''}
        >
          Market
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {type === 'limit' && (
          <div className="bg-background rounded px-3 py-2 flex justify-between items-center border border-border focus-within:border-primary">
            <span className="text-xs text-text-secondary">Price</span>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="bg-transparent text-right text-sm text-text-primary focus:outline-none w-24"
                placeholder="0.00"
              />
              <span className="text-xs text-text-secondary">USDT</span>
            </div>
          </div>
        )}

        <div className="bg-background rounded px-3 py-2 flex justify-between items-center border border-border focus-within:border-primary">
          <span className="text-xs text-text-secondary">Amount</span>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="bg-transparent text-right text-sm text-text-primary focus:outline-none w-24"
              placeholder="0.00"
            />
            <span className="text-xs text-text-secondary">BTC</span>
          </div>
        </div>

        {type === 'limit' && (
          <div className="bg-background rounded px-3 py-2 flex justify-between items-center border border-border">
            <span className="text-xs text-text-secondary">Total</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-text-primary">
                {isNaN(total) ? '0.00' : total.toFixed(2)}
              </span>
              <span className="text-xs text-text-secondary">USDT</span>
            </div>
          </div>
        )}

        <div className="flex justify-between text-xs text-text-secondary">
          <span>Avail</span>
          <span>{balance.toFixed(4)} {asset}</span>
        </div>

        {isAuthenticated ? (
          <button
            type="submit"
            className={`w-full py-2.5 rounded text-sm font-bold mt-2 ${
              side === 'buy' ? 'bg-success text-white' : 'bg-danger text-white'
            }`}
          >
            {side === 'buy' ? 'Buy BTC' : 'Sell BTC'}
          </button>
        ) : (
          <div className="text-center py-2.5 bg-background rounded border border-border mt-2">
            <a href="/login" className="text-primary text-sm font-medium hover:underline">Log In</a>
            <span className="text-text-secondary text-sm mx-1">or</span>
            <a href="/register" className="text-primary text-sm font-medium hover:underline">Register</a>
          </div>
        )}
      </form>
    </div>
  );
}
