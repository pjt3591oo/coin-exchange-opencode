import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { wsConfig, redisConfig } from '@exchange/config';
import { createServiceLogger } from '@exchange/logger';
import { initRedis, getSubscriber, getJson, disconnectRedis } from '@exchange/redis';
import type { WsMessage, WsSubscribeMessage, Orderbook } from '@exchange/types';

const logger = createServiceLogger('ws-gateway');

interface ClientState {
  id: string;
  subscriptions: Set<string>;
  isAlive: boolean;
}

const clients = new Map<WebSocket, ClientState>();
const channelSubscribers = new Map<string, Set<WebSocket>>();

let clientIdCounter = 0;

function broadcast(channel: string, message: object): void {
  const subscribers = channelSubscribers.get(channel);
  if (!subscribers) return;

  const payload = JSON.stringify(message);

  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function subscribeClient(ws: WebSocket, channels: string[]): void {
  const state = clients.get(ws);
  if (!state) return;

  for (const channel of channels) {
    if (state.subscriptions.has(channel)) continue;

    state.subscriptions.add(channel);

    let subscribers = channelSubscribers.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      channelSubscribers.set(channel, subscribers);
    }
    subscribers.add(ws);
  }

  ws.send(JSON.stringify({ type: 'subscribed', channels }));
}

function unsubscribeClient(ws: WebSocket, channels: string[]): void {
  const state = clients.get(ws);
  if (!state) return;

  for (const channel of channels) {
    state.subscriptions.delete(channel);

    const subscribers = channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        channelSubscribers.delete(channel);
      }
    }
  }

  ws.send(JSON.stringify({ type: 'unsubscribed', channels }));
}

function cleanupClient(ws: WebSocket): void {
  const state = clients.get(ws);
  if (!state) return;

  for (const channel of state.subscriptions) {
    const subscribers = channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        channelSubscribers.delete(channel);
      }
    }
  }

  clients.delete(ws);
  logger.debug({ clientId: state.id }, 'Client disconnected');
}

async function sendOrderbookSnapshot(ws: WebSocket, symbol: string): Promise<void> {
  const orderbook = await getJson<Orderbook>(`orderbook:${symbol}`);

  if (orderbook) {
    ws.send(JSON.stringify({
      type: 'snapshot',
      channel: `orderbook:${symbol}`,
      sequence: orderbook.sequence,
      bids: orderbook.bids.map(b => [b.price, b.quantity]),
      asks: orderbook.asks.map(a => [a.price, a.quantity]),
      timestamp: orderbook.timestamp,
    }));
  }
}

async function handleMessage(ws: WebSocket, data: string): Promise<void> {
  try {
    const message = JSON.parse(data) as WsMessage;

    switch (message.type) {
      case 'subscribe': {
        const subMsg = message as WsSubscribeMessage;
        subscribeClient(ws, subMsg.channels);

        for (const channel of subMsg.channels) {
          if (channel.startsWith('orderbook:')) {
            const symbol = channel.replace('orderbook:', '');
            await sendOrderbookSnapshot(ws, symbol);
          }
        }
        break;
      }

      case 'unsubscribe': {
        const unsubMsg = message as WsSubscribeMessage;
        unsubscribeClient(ws, unsubMsg.channels);
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Unknown message type' }));
    }
  } catch {
    ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON' }));
  }
}

async function main() {
  logger.info('Starting WebSocket Gateway...');

  initRedis(redisConfig);

  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    const clientId = `client-${++clientIdCounter}`;
    clients.set(ws, {
      id: clientId,
      subscriptions: new Set(),
      isAlive: true,
    });

    logger.debug({ clientId }, 'Client connected');

    ws.on('message', (data) => {
      handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      cleanupClient(ws);
    });

    ws.on('error', (error) => {
      logger.error({ error, clientId }, 'WebSocket error');
      cleanupClient(ws);
    });

    ws.on('pong', () => {
      const state = clients.get(ws);
      if (state) state.isAlive = true;
    });

    ws.send(JSON.stringify({ type: 'connected', clientId, timestamp: Date.now() }));
  });

  const heartbeat = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        ws.terminate();
        cleanupClient(ws);
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  const subscriber = getSubscriber();

  const patterns = ['orderbook:*', 'trades:*', 'candles:*'];
  
  await subscriber.psubscribe(...patterns);

  subscriber.on('pmessage', (_pattern, channel, message) => {
    try {
      const data = JSON.parse(message);
      let formattedMessage: object;

      if (channel.startsWith('trades:')) {
        formattedMessage = {
          type: 'trade',
          channel,
          data,
        };
      } else if (channel.startsWith('orderbook:')) {
        formattedMessage = {
          type: data.type || 'delta',
          channel,
          ...data,
        };
      } else if (channel.startsWith('candles:')) {
        formattedMessage = {
          type: 'candle',
          channel,
          data: data.data || data,
        };
      } else {
        formattedMessage = data;
      }

      broadcast(channel, formattedMessage);
    } catch (error) {
      logger.error({ error, channel }, 'Failed to broadcast message');
    }
  });

  server.listen(wsConfig.port, wsConfig.host, () => {
    logger.info({ port: wsConfig.port, host: wsConfig.host }, 'WebSocket Gateway started');
  });

  const shutdown = async () => {
    logger.info('Shutting down WebSocket Gateway...');
    clearInterval(heartbeat);
    
    for (const ws of clients.keys()) {
      ws.close(1001, 'Server shutting down');
    }
    
    wss.close();
    server.close();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ error: err }, 'Failed to start WebSocket Gateway');
  process.exit(1);
});
