import type { OrderSide, OrderType } from './order.js';

export const KAFKA_TOPICS = {
  ORDERS: 'orders',
  TRADES: 'trades',
  ORDERBOOK_UPDATES: 'orderbook-updates',
  BALANCE_UPDATES: 'balance-updates',
} as const;

export type OrderCommandType = 'NEW' | 'CANCEL';

export interface OrderCommand {
  commandId: string;
  orderId: string;
  userId: string;
  symbol: string;
  type: OrderCommandType;
  timestamp: number;
  payload: NewOrderPayload | CancelOrderPayload;
}

export interface NewOrderPayload {
  side: OrderSide;
  orderType: OrderType;
  price?: string;
  quantity: string;
  clientOrderId?: string;
}

export interface CancelOrderPayload {
  reason?: string;
}

export interface TradeEvent {
  tradeId: string;
  symbol: string;
  price: string;
  quantity: string;
  quoteQty: string;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  isBuyerMaker: boolean;
  makerFee: string;
  takerFee: string;
  executedAt: number;
}

export interface OrderbookUpdateEvent {
  symbol: string;
  sequence: number;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface BalanceUpdateEvent {
  userId: string;
  asset: string;
  available: string;
  locked: string;
  timestamp: number;
}
