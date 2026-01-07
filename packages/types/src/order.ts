export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export interface Order {
  id: string;
  clientOrderId?: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: string;
  quantity: string;
  filledQty: string;
  remainingQty: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: string;
  quantity: string;
  clientOrderId?: string;
}

export interface OrderResponse {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: string;
  quantity: string;
  filledQty: string;
  remainingQty: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CancelOrderRequest {
  orderId: string;
  symbol: string;
}
