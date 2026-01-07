export type MarketStatus = 'ACTIVE' | 'HALTED' | 'DELISTED';

export interface Asset {
  id: string;
  name: string;
  decimals: number;
  status: string;
}

export interface Market {
  id: string;
  baseAsset: string;
  quoteAsset: string;
  priceDecimals: number;
  qtyDecimals: number;
  minQty: string;
  maxQty: string;
  minNotional: string;
  makerFee: string;
  takerFee: string;
  status: MarketStatus;
}

export interface OrderbookLevel {
  price: string;
  quantity: string;
}

export interface Orderbook {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  sequence: number;
  timestamp: number;
}

export interface OrderbookDelta {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  sequence: number;
  timestamp: number;
}

export interface Ticker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  volume: string;
  quoteVolume: string;
}

export interface Candle {
  symbol: string;
  timeframe: string;
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quoteVolume: string;
  tradeCount: number;
  closed: boolean;
}
