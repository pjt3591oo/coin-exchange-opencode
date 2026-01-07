'use client';

import { useEffect, useCallback } from 'react';
import { wsManager } from '@/lib/websocket';
import { useMarketStore, useUserStore } from '@/store';
import api from '@/lib/api';

export function useWebSocket(symbol: string) {
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const updateOrderbook = useMarketStore((s) => s.updateOrderbook);
  const addTrade = useMarketStore((s) => s.addTrade);
  const setCandles = useMarketStore((s) => s.setCandles);
  const clearData = useMarketStore((s) => s.clearData);
  
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const setBalances = useUserStore((s) => s.setBalances);

  const fetchInitialData = useCallback(async () => {
    try {
      console.log('Fetching initial data for', symbol);
      
      const orderbookRes = await api.get(`/markets/${symbol.replace('/', '-')}/orderbook`);
      const orderbook = orderbookRes.data;
      console.log('Orderbook:', orderbook);
      
      if (orderbook.bids && orderbook.asks) {
        const bids: [string, string][] = orderbook.bids.map((b: any) => [b.price, b.quantity]);
        const asks: [string, string][] = orderbook.asks.map((a: any) => [a.price, a.quantity]);
        updateOrderbook(bids, asks, true);
      }

      const tradesRes = await api.get(`/markets/${symbol.replace('/', '-')}/trades?limit=50`);
      const trades = tradesRes.data;
      console.log('Trades:', trades);
      
      if (Array.isArray(trades)) {
        const reversedTrades = [...trades].reverse();
        reversedTrades.forEach((trade: any) => {
          addTrade({
            id: trade.id,
            price: parseFloat(trade.price),
            quantity: parseFloat(trade.quantity),
            side: trade.side,
            timestamp: new Date(trade.executedAt).getTime(),
          });
        });
      }

      const candlesRes = await api.get(`/markets/${symbol.replace('/', '-')}/candles?timeframe=1m&limit=500`);
      const candlesData = candlesRes.data;
      if (Array.isArray(candlesData)) {
        const candles = candlesData.map((c: any) => ({
          time: c.openTime,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        setCandles(candles);
      }

      if (isAuthenticated) {
        try {
          const balancesRes = await api.get('/account/balances');
          setBalances(balancesRes.data);
        } catch (e) {
          console.error('Failed to fetch balances:', e);
        }
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    }
  }, [symbol, isAuthenticated, updateOrderbook, addTrade, setCandles, setBalances]);

  useEffect(() => {
    setSymbol(symbol);
    clearData();
    
    fetchInitialData();
    
    wsManager.connect();
    wsManager.subscribe([`orderbook:${symbol}`, `trades:${symbol}`, `candles:${symbol}:1m`]);

    return () => {
      wsManager.disconnect();
    };
  }, [symbol, setSymbol, clearData, fetchInitialData]);

  return { refetch: fetchInitialData };
}
