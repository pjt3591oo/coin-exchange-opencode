import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ConflictError, AuthenticationError } from '@exchange/errors';
import type { User, AuthResponse } from '@exchange/types';

const INITIAL_ASSETS = ['BTC', 'ETH', 'USDT', 'SOL', 'XRP'];
const INITIAL_BALANCES: Record<string, string> = {
  USDT: '1000000',
  BTC: '10',
  ETH: '100',
  SOL: '1000',
  XRP: '100000',
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

interface DbUser extends User {
  password_hash: string;
}

function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * (multipliers[unit] ?? 1);
}

export function createAuthRouter(jwtSecret: string, jwtExpiresIn: string) {
  const router = Router();
  const expiresInSeconds = parseExpiresIn(jwtExpiresIn);
  
  const signOptions: SignOptions = {
    expiresIn: expiresInSeconds,
  };

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const data = registerSchema.parse(req.body);

      const existingUser = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [data.email]
      );

      if (existingUser) {
        throw new ConflictError('Email already registered');
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const userId = uuidv4();

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)`,
          [userId, data.email, passwordHash]
        );

        for (const asset of INITIAL_ASSETS) {
          const initialBalance = INITIAL_BALANCES[asset] ?? '0';
          await client.query(
            `INSERT INTO account_balances (user_id, asset, available, locked)
             VALUES ($1, $2, $3, 0)`,
            [userId, asset, initialBalance]
          );
        }
      });

      const token = jwt.sign(
        { sub: userId, email: data.email },
        jwtSecret,
        signOptions
      );

      const response: AuthResponse = {
        accessToken: token,
        expiresIn: expiresInSeconds,
        user: { id: userId, email: data.email },
      };

      res.status(201).json(response);
    })
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const data = loginSchema.parse(req.body);

      const user = await queryOne<DbUser>(
        'SELECT id, email, password_hash, status FROM users WHERE email = $1',
        [data.email]
      );

      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      if (user.status !== 'ACTIVE') {
        throw new AuthenticationError('Account is not active');
      }

      const validPassword = await bcrypt.compare(data.password, user.password_hash);
      if (!validPassword) {
        throw new AuthenticationError('Invalid email or password');
      }

      const token = jwt.sign(
        { sub: user.id, email: user.email },
        jwtSecret,
        signOptions
      );

      const response: AuthResponse = {
        accessToken: token,
        expiresIn: expiresInSeconds,
        user: { id: user.id, email: user.email },
      };

      res.json(response);
    })
  );

  router.post(
    '/refresh',
    asyncHandler(async (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AuthenticationError();
      }

      const token = authHeader.slice(7);
      
      try {
        const payload = jwt.verify(token, jwtSecret, { ignoreExpiration: true }) as {
          sub: string;
          email: string;
        };

        const user = await queryOne<{ status: string }>(
          'SELECT status FROM users WHERE id = $1',
          [payload.sub]
        );

        if (!user || user.status !== 'ACTIVE') {
          throw new AuthenticationError('User not found or inactive');
        }

        const newToken = jwt.sign(
          { sub: payload.sub, email: payload.email },
          jwtSecret,
          signOptions
        );

        res.json({
          accessToken: newToken,
          expiresIn: expiresInSeconds,
        });
      } catch {
        throw new AuthenticationError('Invalid token');
      }
    })
  );

  return router;
}
