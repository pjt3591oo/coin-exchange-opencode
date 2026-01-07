import pg from 'pg';
const { Pool } = pg;
import { Decimal } from 'decimal.js';
import { config, dbConfig, redisConfig, kafkaConfig } from '@exchange/config';
import { createServiceLogger } from '@exchange/logger';
import { initRedis, publish, disconnectRedis } from '@exchange/redis';
import { initKafka, createConsumer, disconnectKafka, EachMessagePayload } from '@exchange/kafka';
import type { TradeEvent, Candle } from '@exchange/types';
import { KAFKA_TOPICS } from '@exchange/types';

const logger = createServiceLogger('ohlcv-aggregator');

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const TIMEFRAMES: { name: Timeframe; ms: number }[] = [
  { name: '1m', ms: 60 * 1000 },
  { name: '5m', ms: 5 * 60 * 1000 },
  { name: '15m', ms: 15 * 60 * 1000 },
  { name: '1h', ms: 60 * 60 * 1000 },
  { name: '4h', ms: 4 * 60 * 60 * 1000 },
  { name: '1d', ms: 24 * 60 * 60 * 1000 },
];

interface CandleState {
  symbol: string;
  timeframe: Timeframe;
  openTime: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  quoteVolume: Decimal;
  tradeCount: number;
}

const currentCandles = new Map<string, CandleState>();

let pool: Pool;

function getCandleKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

function getBucketStart(timestamp: number, intervalMs: number): number {
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

async function persistCandle(candle: CandleState): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO candles 
       (symbol, timeframe, open_time, open, high, low, close, volume, quote_volume, trade_count, closed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       ON CONFLICT (symbol, timeframe, open_time) DO UPDATE SET
         high = GREATEST(candles.high, $5),
         low = LEAST(candles.low, $6),
         close = $7,
         volume = $8,
         quote_volume = $9,
         trade_count = $10,
         closed = TRUE`,
      [
        candle.symbol,
        candle.timeframe,
        new Date(candle.openTime),
        candle.open.toString(),
        candle.high.toString(),
        candle.low.toString(),
        candle.close.toString(),
        candle.volume.toString(),
        candle.quoteVolume.toString(),
        candle.tradeCount,
      ]
    );
  } catch (error) {
    logger.error({ error, candle: { symbol: candle.symbol, timeframe: candle.timeframe } }, 'Failed to persist candle');
  }
}

async function processTrade(trade: TradeEvent): Promise<void> {
  const price = new Decimal(trade.price);
  const quantity = new Decimal(trade.quantity);
  const quoteQty = new Decimal(trade.quoteQty);
  const timestamp = trade.executedAt;

  for (const tf of TIMEFRAMES) {
    const bucketStart = getBucketStart(timestamp, tf.ms);
    const key = getCandleKey(trade.symbol, tf.name);
    
    let candle = currentCandles.get(key);

    if (!candle || candle.openTime !== bucketStart) {
      if (candle && candle.openTime !== bucketStart) {
        await persistCandle(candle);
        
        await publish(`candles:${trade.symbol}:${tf.name}`, {
          type: 'candle',
          data: {
            openTime: candle.openTime,
            open: candle.open.toString(),
            high: candle.high.toString(),
            low: candle.low.toString(),
            close: candle.close.toString(),
            volume: candle.volume.toString(),
            closed: true,
          },
        });
      }

      candle = {
        symbol: trade.symbol,
        timeframe: tf.name,
        openTime: bucketStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        quoteVolume: quoteQty,
        tradeCount: 1,
      };
      currentCandles.set(key, candle);
    } else {
      if (price.greaterThan(candle.high)) {
        candle.high = price;
      }
      if (price.lessThan(candle.low)) {
        candle.low = price;
      }
      candle.close = price;
      candle.volume = candle.volume.plus(quantity);
      candle.quoteVolume = candle.quoteVolume.plus(quoteQty);
      candle.tradeCount++;
    }

    await publish(`candles:${trade.symbol}:${tf.name}`, {
      type: 'candle',
      data: {
        openTime: candle.openTime,
        open: candle.open.toString(),
        high: candle.high.toString(),
        low: candle.low.toString(),
        close: candle.close.toString(),
        volume: candle.volume.toString(),
        closed: false,
      },
    });
  }
}

async function main() {
  logger.info('Starting OHLCV Aggregator...');

  pool = new Pool({
    connectionString: dbConfig.connectionString,
    max: 10,
  });

  initRedis(redisConfig);
  initKafka(kafkaConfig);

  const handleMessage = async ({ message }: EachMessagePayload) => {
    if (!message.value) return;

    try {
      const trade = JSON.parse(message.value.toString()) as TradeEvent;
      await processTrade(trade);
    } catch (error) {
      logger.error({ error }, 'Failed to process trade for OHLCV');
    }
  };

  await createConsumer(
    {
      groupId: 'ohlcv-aggregator',
      topics: [KAFKA_TOPICS.TRADES],
    },
    handleMessage
  );

  logger.info('OHLCV Aggregator started');

  const flushInterval = setInterval(async () => {
    for (const candle of currentCandles.values()) {
      await persistCandle(candle);
    }
  }, 10000);

  const shutdown = async () => {
    logger.info('Shutting down OHLCV Aggregator...');
    clearInterval(flushInterval);

    for (const candle of currentCandles.values()) {
      await persistCandle(candle);
    }

    await disconnectKafka();
    await disconnectRedis();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, 'Failed to start OHLCV Aggregator');
  process.exit(1);
});
