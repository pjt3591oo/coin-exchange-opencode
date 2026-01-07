import { Router } from 'express';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { publishMessage } from '@exchange/kafka';
import {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  OrderError,
  MarketError,
} from '@exchange/errors';
import type {
  OrderResponse,
  OrderCommand,
  NewOrderPayload,
  CancelOrderPayload,
} from '@exchange/types';
import { KAFKA_TOPICS } from '@exchange/types';

const createOrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['LIMIT', 'MARKET']),
  price: z.string().optional(),
  quantity: z.string().refine(
    (val) => {
      const d = new Decimal(val);
      return d.isPositive() && d.isFinite();
    },
    'Quantity must be a positive number'
  ),
  clientOrderId: z.string().optional(),
});

export function createOrdersRouter() {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const data = createOrderSchema.parse(req.body);
      const symbol = data.symbol.toUpperCase().replace('-', '/');

      const market = await queryOne<{
        id: string;
        base_asset: string;
        quote_asset: string;
        min_qty: string;
        max_qty: string;
        min_notional: string;
        status: string;
      }>(
        `SELECT id, base_asset, quote_asset, min_qty, max_qty, min_notional, status
         FROM markets WHERE id = $1`,
        [symbol]
      );

      if (!market) {
        throw new NotFoundError('Market', symbol);
      }

      if (market.status !== 'ACTIVE') {
        throw new MarketError('Market is not active', symbol);
      }

      const quantity = new Decimal(data.quantity);

      if (quantity.lessThan(market.min_qty)) {
        throw new OrderError(
          `Quantity below minimum: ${market.min_qty}`,
          'QTY_TOO_LOW',
          { minQty: market.min_qty }
        );
      }

      if (quantity.greaterThan(market.max_qty)) {
        throw new OrderError(
          `Quantity above maximum: ${market.max_qty}`,
          'QTY_TOO_HIGH',
          { maxQty: market.max_qty }
        );
      }

      let price: Decimal | undefined;

      if (data.type === 'LIMIT') {
        if (!data.price) {
          throw new ValidationError('Price is required for limit orders');
        }
        price = new Decimal(data.price);
        if (!price.isPositive()) {
          throw new ValidationError('Price must be positive');
        }

        const notional = price.mul(quantity);
        if (notional.lessThan(market.min_notional)) {
          throw new OrderError(
            `Notional value below minimum: ${market.min_notional}`,
            'NOTIONAL_TOO_LOW',
            { minNotional: market.min_notional }
          );
        }
      }

      const orderId = uuidv4();
      const clientOrderId = data.clientOrderId ?? orderId;

      const lockAsset = data.side === 'BUY' ? market.quote_asset : market.base_asset;
      const lockAmount =
        data.side === 'BUY'
          ? price ? price.mul(quantity) : quantity.mul(new Decimal('100000'))
          : quantity;

      const order = await withTransaction(async (client) => {
        const balance = await client.query(
          `SELECT available::text, version 
           FROM account_balances 
           WHERE user_id = $1 AND asset = $2 
           FOR UPDATE`,
          [userId, lockAsset]
        );

        if (balance.rows.length === 0) {
          throw new InsufficientBalanceError(lockAsset, lockAmount.toString(), '0');
        }

        const available = new Decimal(balance.rows[0].available);
        if (available.lessThan(lockAmount)) {
          throw new InsufficientBalanceError(
            lockAsset,
            lockAmount.toString(),
            available.toString()
          );
        }

        await client.query(
          `UPDATE account_balances 
           SET available = available - $1, locked = locked + $1, version = version + 1
           WHERE user_id = $2 AND asset = $3`,
          [lockAmount.toString(), userId, lockAsset]
        );

        await client.query(
          `INSERT INTO balance_entries 
           (user_id, asset, amount, balance_after, entry_type, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, 'LOCK', 'ORDER', $5)`,
          [
            userId,
            lockAsset,
            lockAmount.negated().toString(),
            available.minus(lockAmount).toString(),
            orderId,
          ]
        );

        const orderResult = await client.query(
          `INSERT INTO orders 
           (id, client_order_id, user_id, symbol, side, type, price, quantity, remaining_qty, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'NEW')
           RETURNING *`,
          [
            orderId,
            clientOrderId,
            userId,
            symbol,
            data.side,
            data.type,
            price?.toString(),
            quantity.toString(),
          ]
        );

        return orderResult.rows[0];
      });

      const orderCommand: OrderCommand = {
        commandId: uuidv4(),
        orderId,
        userId,
        symbol,
        type: 'NEW',
        timestamp: Date.now(),
        payload: {
          side: data.side,
          orderType: data.type,
          price: price?.toString(),
          quantity: quantity.toString(),
          clientOrderId,
        } as NewOrderPayload,
      };

      await publishMessage(KAFKA_TOPICS.ORDERS, symbol, orderCommand);

      const response: OrderResponse = {
        orderId: order.id,
        clientOrderId: order.client_order_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.price?.toString(),
        quantity: order.quantity.toString(),
        filledQty: order.filled_qty.toString(),
        remainingQty: order.remaining_qty.toString(),
        status: order.status,
        createdAt: order.created_at.toISOString(),
        updatedAt: order.updated_at.toISOString(),
      };

      res.status(201).json(response);
    })
  );

  router.delete(
    '/:orderId',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const orderId = req.params['orderId']!;

      const order = await queryOne<{
        id: string;
        user_id: string;
        symbol: string;
        status: string;
      }>(
        `SELECT id, user_id, symbol, status FROM orders WHERE id = $1`,
        [orderId]
      );

      if (!order) {
        throw new NotFoundError('Order', orderId);
      }

      if (order.user_id !== userId) {
        throw new NotFoundError('Order', orderId);
      }

      if (!['NEW', 'PARTIAL'].includes(order.status)) {
        throw new OrderError('Order cannot be cancelled', 'INVALID_STATUS', {
          status: order.status,
        });
      }

      const orderCommand: OrderCommand = {
        commandId: uuidv4(),
        orderId,
        userId,
        symbol: order.symbol,
        type: 'CANCEL',
        timestamp: Date.now(),
        payload: {} as CancelOrderPayload,
      };

      await publishMessage(KAFKA_TOPICS.ORDERS, order.symbol, orderCommand);

      res.json({ orderId, status: 'CANCEL_PENDING' });
    })
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const symbol = (req.query['symbol'] as string)?.toUpperCase().replace('-', '/');
      const status = req.query['status'] as string;
      const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 500);

      let sql = `
        SELECT id, client_order_id, symbol, side, type, price::text, 
               quantity::text, filled_qty::text, remaining_qty::text, 
               status, created_at, updated_at
        FROM orders
        WHERE user_id = $1
      `;
      const params: unknown[] = [userId];
      let paramIndex = 2;

      if (symbol) {
        sql += ` AND symbol = $${paramIndex++}`;
        params.push(symbol);
      }

      if (status) {
        sql += ` AND status = $${paramIndex++}`;
        params.push(status.toUpperCase());
      }

      sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const orders = await query<{
        id: string;
        client_order_id: string;
        symbol: string;
        side: string;
        type: string;
        price: string | null;
        quantity: string;
        filled_qty: string;
        remaining_qty: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }>(sql, params);

      const response: OrderResponse[] = orders.map((o) => ({
        orderId: o.id,
        clientOrderId: o.client_order_id,
        symbol: o.symbol,
        side: o.side as 'BUY' | 'SELL',
        type: o.type as 'LIMIT' | 'MARKET',
        price: o.price ?? undefined,
        quantity: o.quantity,
        filledQty: o.filled_qty,
        remainingQty: o.remaining_qty,
        status: o.status as 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED',
        createdAt: o.created_at.toISOString(),
        updatedAt: o.updated_at.toISOString(),
      }));

      res.json(response);
    })
  );

  router.get(
    '/:orderId',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const orderId = req.params['orderId']!;

      const order = await queryOne<{
        id: string;
        client_order_id: string;
        user_id: string;
        symbol: string;
        side: string;
        type: string;
        price: string | null;
        quantity: string;
        filled_qty: string;
        remaining_qty: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, client_order_id, user_id, symbol, side, type, price::text, 
                quantity::text, filled_qty::text, remaining_qty::text, 
                status, created_at, updated_at
         FROM orders WHERE id = $1`,
        [orderId]
      );

      if (!order || order.user_id !== userId) {
        throw new NotFoundError('Order', orderId);
      }

      const response: OrderResponse = {
        orderId: order.id,
        clientOrderId: order.client_order_id,
        symbol: order.symbol,
        side: order.side as 'BUY' | 'SELL',
        type: order.type as 'LIMIT' | 'MARKET',
        price: order.price ?? undefined,
        quantity: order.quantity,
        filledQty: order.filled_qty,
        remainingQty: order.remaining_qty,
        status: order.status as 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED',
        createdAt: order.created_at.toISOString(),
        updatedAt: order.updated_at.toISOString(),
      };

      res.json(response);
    })
  );

  return router;
}
