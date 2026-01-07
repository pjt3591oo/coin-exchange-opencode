import { Router } from 'express';
import { query, queryOne } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError } from '@exchange/errors';
import { getJson } from '@exchange/redis';
import type { Market, Orderbook, Candle } from '@exchange/types';

export function createMarketsRouter() {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const markets = await query<{
        id: string;
        base_asset: string;
        quote_asset: string;
        price_decimals: number;
        qty_decimals: number;
        min_qty: string;
        max_qty: string;
        min_notional: string;
        maker_fee: string;
        taker_fee: string;
        status: string;
      }>(
        `SELECT id, base_asset, quote_asset, price_decimals, qty_decimals,
                min_qty::text, max_qty::text, min_notional::text,
                maker_fee::text, taker_fee::text, status
         FROM markets WHERE status = 'ACTIVE' ORDER BY id`
      );

      const response: Market[] = markets.map((m) => ({
        id: m.id,
        baseAsset: m.base_asset,
        quoteAsset: m.quote_asset,
        priceDecimals: m.price_decimals,
        qtyDecimals: m.qty_decimals,
        minQty: m.min_qty,
        maxQty: m.max_qty,
        minNotional: m.min_notional,
        makerFee: m.maker_fee,
        takerFee: m.taker_fee,
        status: m.status as 'ACTIVE' | 'HALTED' | 'DELISTED',
      }));

      res.json(response);
    })
  );

  router.get(
    '/:symbol',
    asyncHandler(async (req, res) => {
      const symbol = req.params['symbol']!.toUpperCase().replace('-', '/');

      const market = await queryOne<{
        id: string;
        base_asset: string;
        quote_asset: string;
        price_decimals: number;
        qty_decimals: number;
        min_qty: string;
        max_qty: string;
        min_notional: string;
        maker_fee: string;
        taker_fee: string;
        status: string;
      }>(
        `SELECT id, base_asset, quote_asset, price_decimals, qty_decimals,
                min_qty::text, max_qty::text, min_notional::text,
                maker_fee::text, taker_fee::text, status
         FROM markets WHERE id = $1`,
        [symbol]
      );

      if (!market) {
        throw new NotFoundError('Market', symbol);
      }

      const response: Market = {
        id: market.id,
        baseAsset: market.base_asset,
        quoteAsset: market.quote_asset,
        priceDecimals: market.price_decimals,
        qtyDecimals: market.qty_decimals,
        minQty: market.min_qty,
        maxQty: market.max_qty,
        minNotional: market.min_notional,
        makerFee: market.maker_fee,
        takerFee: market.taker_fee,
        status: market.status as 'ACTIVE' | 'HALTED' | 'DELISTED',
      };

      res.json(response);
    })
  );

  router.get(
    '/:symbol/orderbook',
    asyncHandler(async (req, res) => {
      const symbol = req.params['symbol']!.toUpperCase().replace('-', '/');
      const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 1000);

      const cached = await getJson<Orderbook>(`orderbook:${symbol}`);
      if (cached) {
        cached.bids = cached.bids.slice(0, limit);
        cached.asks = cached.asks.slice(0, limit);
        res.json(cached);
        return;
      }

      const bids = await query<{ price: string; total_qty: string }>(
        `SELECT price::text, SUM(remaining_qty)::text as total_qty
         FROM orders
         WHERE symbol = $1 AND side = 'BUY' AND status IN ('NEW', 'PARTIAL')
         GROUP BY price
         ORDER BY price DESC
         LIMIT $2`,
        [symbol, limit]
      );

      const asks = await query<{ price: string; total_qty: string }>(
        `SELECT price::text, SUM(remaining_qty)::text as total_qty
         FROM orders
         WHERE symbol = $1 AND side = 'SELL' AND status IN ('NEW', 'PARTIAL')
         GROUP BY price
         ORDER BY price ASC
         LIMIT $2`,
        [symbol, limit]
      );

      const orderbook: Orderbook = {
        symbol,
        bids: bids.map((b) => ({ price: b.price, quantity: b.total_qty })),
        asks: asks.map((a) => ({ price: a.price, quantity: a.total_qty })),
        sequence: Date.now(),
        timestamp: Date.now(),
      };

      res.json(orderbook);
    })
  );

  router.get(
    '/:symbol/trades',
    asyncHandler(async (req, res) => {
      const symbol = req.params['symbol']!.toUpperCase().replace('-', '/');
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);

      const trades = await query<{
        id: string;
        price: string;
        quantity: string;
        quote_qty: string;
        is_buyer_maker: boolean;
        executed_at: Date;
      }>(
        `SELECT id::text, price::text, quantity::text, quote_qty::text, 
                is_buyer_maker, executed_at
         FROM trades
         WHERE symbol = $1
         ORDER BY executed_at DESC
         LIMIT $2`,
        [symbol, limit]
      );

      const response = trades.map((t) => ({
        id: t.id,
        symbol,
        price: t.price,
        quantity: t.quantity,
        quoteQty: t.quote_qty,
        side: t.is_buyer_maker ? 'SELL' : 'BUY',
        executedAt: t.executed_at.toISOString(),
      }));

      res.json(response);
    })
  );

  router.get(
    '/:symbol/candles',
    asyncHandler(async (req, res) => {
      const symbol = req.params['symbol']!.toUpperCase().replace('-', '/');
      const timeframe = (req.query['timeframe'] as string) || '1m';
      const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 1000);

      const candles = await query<{
        open_time: Date;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
        quote_volume: string;
        trade_count: number;
        closed: boolean;
      }>(
        `SELECT open_time, open::text, high::text, low::text, close::text,
                volume::text, quote_volume::text, trade_count, closed
         FROM candles
         WHERE symbol = $1 AND timeframe = $2
         ORDER BY open_time DESC
         LIMIT $3`,
        [symbol, timeframe, limit]
      );

      const response: Candle[] = candles.reverse().map((c) => ({
        symbol,
        timeframe,
        openTime: c.open_time.getTime(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        quoteVolume: c.quote_volume,
        tradeCount: c.trade_count,
        closed: c.closed,
      }));

      res.json(response);
    })
  );

  return router;
}
