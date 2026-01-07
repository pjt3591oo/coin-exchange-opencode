export interface Trade {
  id: string;
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
  executedAt: Date;
}

export interface TradeResponse {
  id: string;
  symbol: string;
  price: string;
  quantity: string;
  quoteQty: string;
  side: 'BUY' | 'SELL';
  executedAt: string;
}

export interface UserTradeResponse extends TradeResponse {
  orderId: string;
  fee: string;
  feeAsset: string;
  isMaker: boolean;
}
