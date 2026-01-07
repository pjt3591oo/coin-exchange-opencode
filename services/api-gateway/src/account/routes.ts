import { Router } from 'express';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { query, queryOne, withTransaction } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ValidationError, InsufficientBalanceError, NotFoundError } from '@exchange/errors';
import type { Balance, AccountBalance } from '@exchange/types';

const depositSchema = z.object({
  asset: z.string().min(1).max(20),
  amount: z.string().refine((val) => {
    const d = new Decimal(val);
    return d.isPositive() && d.isFinite();
  }, 'Amount must be a positive number'),
});

const withdrawSchema = z.object({
  asset: z.string().min(1).max(20),
  amount: z.string().refine((val) => {
    const d = new Decimal(val);
    return d.isPositive() && d.isFinite();
  }, 'Amount must be a positive number'),
});

export function createAccountRouter() {
  const router = Router();

  router.get(
    '/balances',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;

      const balances = await query<{ asset: string; available: string; locked: string }>(
        `SELECT asset, available::text, locked::text 
         FROM account_balances 
         WHERE user_id = $1 
         ORDER BY asset`,
        [userId]
      );

      const response: Balance[] = balances.map((b) => ({
        asset: b.asset,
        available: b.available,
        locked: b.locked,
      }));

      res.json(response);
    })
  );

  router.get(
    '/balances/:asset',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const { asset } = req.params;

      const balance = await queryOne<{ asset: string; available: string; locked: string }>(
        `SELECT asset, available::text, locked::text 
         FROM account_balances 
         WHERE user_id = $1 AND asset = $2`,
        [userId, asset!.toUpperCase()]
      );

      if (!balance) {
        throw new NotFoundError('Balance', asset);
      }

      const response: Balance = {
        asset: balance.asset,
        available: balance.available,
        locked: balance.locked,
      };

      res.json(response);
    })
  );

  router.post(
    '/deposit',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const data = depositSchema.parse(req.body);
      const asset = data.asset.toUpperCase();
      const amount = new Decimal(data.amount);

      const assetExists = await queryOne<{ id: string }>(
        'SELECT id FROM assets WHERE id = $1',
        [asset]
      );

      if (!assetExists) {
        throw new NotFoundError('Asset', asset);
      }

      const result = await withTransaction(async (client) => {
        const balance = await client.query(
          `INSERT INTO account_balances (user_id, asset, available, locked)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (user_id, asset) DO UPDATE
           SET available = account_balances.available + $3,
               version = account_balances.version + 1
           RETURNING available::text, locked::text`,
          [userId, asset, amount.toString()]
        );

        const newBalance = balance.rows[0];

        await client.query(
          `INSERT INTO balance_entries (user_id, asset, amount, balance_after, entry_type, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, 'DEPOSIT', 'DEPOSIT', $5)`,
          [userId, asset, amount.toString(), newBalance.available, `DEP-${Date.now()}`]
        );

        return newBalance;
      });

      res.json({
        asset,
        amount: data.amount,
        available: result.available,
        locked: result.locked,
      });
    })
  );

  router.post(
    '/withdraw',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const data = withdrawSchema.parse(req.body);
      const asset = data.asset.toUpperCase();
      const amount = new Decimal(data.amount);

      const result = await withTransaction(async (client) => {
        const balance = await client.query(
          `SELECT available::text, locked::text, version 
           FROM account_balances 
           WHERE user_id = $1 AND asset = $2 
           FOR UPDATE`,
          [userId, asset]
        );

        if (balance.rows.length === 0) {
          throw new NotFoundError('Balance', asset);
        }

        const current = balance.rows[0];
        const available = new Decimal(current.available);

        if (available.lessThan(amount)) {
          throw new InsufficientBalanceError(asset, amount.toString(), available.toString());
        }

        const newAvailable = available.minus(amount);

        await client.query(
          `UPDATE account_balances 
           SET available = $1, version = version + 1 
           WHERE user_id = $2 AND asset = $3`,
          [newAvailable.toString(), userId, asset]
        );

        await client.query(
          `INSERT INTO balance_entries (user_id, asset, amount, balance_after, entry_type, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, 'WITHDRAW', 'WITHDRAWAL', $5)`,
          [userId, asset, amount.negated().toString(), newAvailable.toString(), `WD-${Date.now()}`]
        );

        return {
          available: newAvailable.toString(),
          locked: current.locked,
        };
      });

      res.json({
        asset,
        amount: data.amount,
        available: result.available,
        locked: result.locked,
      });
    })
  );

  return router;
}
