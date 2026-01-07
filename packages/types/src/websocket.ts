export type WsMessageType = 
  | 'subscribe' 
  | 'unsubscribe' 
  | 'ping' 
  | 'pong' 
  | 'snapshot' 
  | 'delta' 
  | 'trade' 
  | 'candle' 
  | 'order' 
  | 'balance'
  | 'error'
  | 'subscribed'
  | 'unsubscribed';

export interface WsMessage {
  type: WsMessageType;
  channel?: string;
  data?: unknown;
  timestamp?: number;
}

export interface WsSubscribeMessage {
  type: 'subscribe';
  channels: string[];
}

export interface WsUnsubscribeMessage {
  type: 'unsubscribe';
  channels: string[];
}

export interface WsOrderbookSnapshot {
  type: 'snapshot';
  channel: string;
  sequence: number;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface WsOrderbookDelta {
  type: 'delta';
  channel: string;
  sequence: number;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface WsTradeMessage {
  type: 'trade';
  channel: string;
  data: {
    id: string;
    price: string;
    quantity: string;
    side: 'BUY' | 'SELL';
    timestamp: number;
  };
}

export interface WsCandleMessage {
  type: 'candle';
  channel: string;
  data: {
    openTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    closed: boolean;
  };
}

export interface WsErrorMessage {
  type: 'error';
  code: string;
  message: string;
}
