import pg from 'pg';
const { Pool } = pg;
type PoolClient = pg.PoolClient;
import { Decimal } from 'decimal.js';
import { config, dbConfig, redisConfig, kafkaConfig } from '@exchange/config';
import { createServiceLogger } from '@exchange/logger';
import { initRedis, publish, setJson, disconnectRedis } from '@exchange/redis';
import { initKafka, createConsumer, disconnectKafka, EachMessagePayload } from '@exchange/kafka';
import type { TradeEvent, OrderbookUpdateEvent } from '@exchange/types';
import { KAFKA_TOPICS } from '@exchange/types';

const logger = createServiceLogger('trade-processor');

let pool: Pool;

async function processTrade(trade: TradeEvent): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const makerOrder = await client.query(
      `SELECT user_id, symbol, side, price::text, quantity::text, remaining_qty::text
       FROM orders WHERE id = $1 FOR UPDATE`,
      [trade.makerOrderId]
    );

    if (makerOrder.rows.length === 0) {
      logger.warn({ orderId: trade.makerOrderId }, 'Maker order not found');
      await client.query('ROLLBACK');
      return;
    }

    const takerOrder = await client.query(
      `SELECT user_id, symbol, side, price::text, quantity::text, remaining_qty::text
       FROM orders WHERE id = $1 FOR UPDATE`,
      [trade.takerOrderId]
    );

    if (takerOrder.rows.length === 0) {
      logger.warn({ orderId: trade.takerOrderId }, 'Taker order not found');
      await client.query('ROLLBACK');
      return;
    }

    const tradeQty = new Decimal(trade.quantity);
    const tradePrice = new Decimal(trade.price);
    const quoteQty = new Decimal(trade.quoteQty);

    await updateOrder(client, trade.makerOrderId, tradeQty);
    await updateOrder(client, trade.takerOrderId, tradeQty);

    await client.query(
      `INSERT INTO trades 
       (symbol, price, quantity, quote_qty, maker_order_id, taker_order_id, 
        maker_user_id, taker_user_id, is_buyer_maker, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        trade.symbol,
        trade.price,
        trade.quantity,
        trade.quoteQty,
        trade.makerOrderId,
        trade.takerOrderId,
        trade.makerUserId,
        trade.takerUserId,
        trade.isBuyerMaker,
        new Date(trade.executedAt),
      ]
    );

    const [baseAsset, quoteAsset] = trade.symbol.split('/');

    if (trade.isBuyerMaker) {
      await settleBalance(client, trade.makerUserId, baseAsset!, tradeQty, trade.makerOrderId);
      await unlockAndDebit(client, trade.makerUserId, quoteAsset!, quoteQty, trade.makerOrderId);
      
      await settleBalance(client, trade.takerUserId, quoteAsset!, quoteQty, trade.takerOrderId);
      await unlockAndDebit(client, trade.takerUserId, baseAsset!, tradeQty, trade.takerOrderId);
    } else {
      await settleBalance(client, trade.makerUserId, quoteAsset!, quoteQty, trade.makerOrderId);
      await unlockAndDebit(client, trade.makerUserId, baseAsset!, tradeQty, trade.makerOrderId);
      
      await settleBalance(client, trade.takerUserId, baseAsset!, tradeQty, trade.takerOrderId);
      await unlockAndDebit(client, trade.takerUserId, quoteAsset!, quoteQty, trade.takerOrderId);
    }

    await client.query('COMMIT');

    await publish(`trades:${trade.symbol}`, {
      id: trade.tradeId,
      price: trade.price,
      quantity: trade.quantity,
      side: trade.isBuyerMaker ? 'SELL' : 'BUY',
      timestamp: trade.executedAt,
    });

    logger.info(
      { tradeId: trade.tradeId, symbol: trade.symbol, price: trade.price, quantity: trade.quantity },
      'Trade processed'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateOrder(client: PoolClient, orderId: string, filledQty: Decimal): Promise<void> {
  await client.query(
    `UPDATE orders 
     SET filled_qty = filled_qty + $1,
         remaining_qty = remaining_qty - $1,
         status = CASE 
           WHEN remaining_qty - $1 <= 0 THEN 'FILLED'
           ELSE 'PARTIAL'
         END
     WHERE id = $2`,
    [filledQty.toString(), orderId]
  );
}

async function settleBalance(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: Decimal,
  referenceId: string
): Promise<void> {
  const result = await client.query(
    `UPDATE account_balances 
     SET available = available + $1, version = version + 1
     WHERE user_id = $2 AND asset = $3
     RETURNING available::text`,
    [amount.toString(), userId, asset]
  );

  if (result.rows.length > 0) {
    await client.query(
      `INSERT INTO balance_entries 
       (user_id, asset, amount, balance_after, entry_type, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, 'TRADE_CREDIT', 'TRADE', $5)`,
      [userId, asset, amount.toString(), result.rows[0].available, referenceId]
    );
  }
}

async function unlockAndDebit(
  client: PoolClient,
  userId: string,
  asset: string,
  amount: Decimal,
  referenceId: string
): Promise<void> {
  const result = await client.query(
    `UPDATE account_balances 
     SET locked = locked - $1, version = version + 1
     WHERE user_id = $2 AND asset = $3
     RETURNING (available + locked)::text as total`,
    [amount.toString(), userId, asset]
  );

  if (result.rows.length > 0) {
    await client.query(
      `INSERT INTO balance_entries 
       (user_id, asset, amount, balance_after, entry_type, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, 'TRADE_DEBIT', 'TRADE', $5)`,
      [userId, asset, amount.negated().toString(), result.rows[0].total, referenceId]
    );
  }
}

async function processOrderbookUpdate(update: OrderbookUpdateEvent): Promise<void> {
  await publish(`orderbook:${update.symbol}`, {
    type: 'delta',
    sequence: update.sequence,
    bids: update.bids,
    asks: update.asks,
    timestamp: update.timestamp,
  });

  const cacheKey = `orderbook:${update.symbol}`;
  const cached = await import('@exchange/redis').then(m => m.getJson<{
    bids: { price: string; quantity: string }[];
    asks: { price: string; quantity: string }[];
    sequence: number;
  }>(cacheKey));

  const bidsMap = new Map<string, string>(
    cached?.bids.map(b => [b.price, b.quantity]) ?? []
  );
  const asksMap = new Map<string, string>(
    cached?.asks.map(a => [a.price, a.quantity]) ?? []
  );

  for (const [price, qty] of update.bids) {
    if (qty === '0') {
      bidsMap.delete(price);
    } else {
      bidsMap.set(price, qty);
    }
  }

  for (const [price, qty] of update.asks) {
    if (qty === '0') {
      asksMap.delete(price);
    } else {
      asksMap.set(price, qty);
    }
  }

  const sortedBids = Array.from(bidsMap.entries())
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
    .slice(0, 100);

  const sortedAsks = Array.from(asksMap.entries())
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
    .slice(0, 100);

  await setJson(cacheKey, {
    symbol: update.symbol,
    bids: sortedBids.map(([p, q]) => ({ price: p, quantity: q })),
    asks: sortedAsks.map(([p, q]) => ({ price: p, quantity: q })),
    sequence: update.sequence,
    timestamp: update.timestamp,
  }, 3600);
}

async function main() {
  logger.info('Starting Trade Processor...');

  pool = new Pool({
    connectionString: dbConfig.connectionString,
    max: dbConfig.max,
  });

  initRedis(redisConfig);
  initKafka(kafkaConfig);

  const handleMessage = async ({ topic, message }: EachMessagePayload) => {
    if (!message.value) return;

    try {
      const data = JSON.parse(message.value.toString());

      if (topic === KAFKA_TOPICS.TRADES) {
        await processTrade(data as TradeEvent);
      } else if (topic === KAFKA_TOPICS.ORDERBOOK_UPDATES) {
        await processOrderbookUpdate(data as OrderbookUpdateEvent);
      }
    } catch (error) {
      logger.error({ error, topic }, 'Failed to process message');
    }
  };

  await createConsumer(
    {
      groupId: 'trade-processor',
      topics: [KAFKA_TOPICS.TRADES, KAFKA_TOPICS.ORDERBOOK_UPDATES],
    },
    handleMessage
  );

  logger.info('Trade Processor started');

  const shutdown = async () => {
    logger.info('Shutting down Trade Processor...');
    await disconnectKafka();
    await disconnectRedis();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, 'Failed to start Trade Processor');
  process.exit(1);
});
