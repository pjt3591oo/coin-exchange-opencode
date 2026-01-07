import Redis from 'ioredis';
import { createServiceLogger } from '@exchange/logger';

const logger = createServiceLogger('redis');

let redis: Redis | null = null;
let subscriber: Redis | null = null;

export interface RedisConfig {
  url: string;
}

export function initRedis(config: RedisConfig): Redis {
  redis = new Redis(config.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error({ error: err }, 'Redis error'));

  return redis;
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redis;
}

export function getSubscriber(): Redis {
  if (!subscriber) {
    const r = getRedis();
    subscriber = r.duplicate();
    subscriber.on('connect', () => logger.info('Redis subscriber connected'));
  }
  return subscriber;
}

export async function publish(channel: string, message: object): Promise<void> {
  const r = getRedis();
  await r.publish(channel, JSON.stringify(message));
}

export async function subscribe(
  channels: string[],
  handler: (channel: string, message: string) => void
): Promise<void> {
  const sub = getSubscriber();
  await sub.subscribe(...channels);
  sub.on('message', handler);
}

export async function get(key: string): Promise<string | null> {
  const r = getRedis();
  return r.get(key);
}

export async function set(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const r = getRedis();
  if (ttlSeconds) {
    await r.setex(key, ttlSeconds, value);
  } else {
    await r.set(key, value);
  }
}

export async function setJson<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  await set(key, JSON.stringify(value), ttlSeconds);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const value = await get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function del(key: string): Promise<void> {
  const r = getRedis();
  await r.del(key);
}

export async function hset(
  key: string,
  field: string,
  value: string
): Promise<void> {
  const r = getRedis();
  await r.hset(key, field, value);
}

export async function hget(key: string, field: string): Promise<string | null> {
  const r = getRedis();
  return r.hget(key, field);
}

export async function hgetall(key: string): Promise<Record<string, string>> {
  const r = getRedis();
  return r.hgetall(key);
}

export async function zadd(
  key: string,
  score: number,
  member: string
): Promise<void> {
  const r = getRedis();
  await r.zadd(key, score, member);
}

export async function zrange(
  key: string,
  start: number,
  stop: number
): Promise<string[]> {
  const r = getRedis();
  return r.zrange(key, start, stop);
}

export async function zrevrange(
  key: string,
  start: number,
  stop: number
): Promise<string[]> {
  const r = getRedis();
  return r.zrevrange(key, start, stop);
}

export async function disconnectRedis(): Promise<void> {
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
  if (redis) {
    redis.disconnect();
    redis = null;
  }
  logger.info('Redis disconnected');
}

export { Redis };
