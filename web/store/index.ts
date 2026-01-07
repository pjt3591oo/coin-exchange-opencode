import { create } from 'zustand';

interface OrderbookLevel {
  price: number;
  quantity: number;
  total: number;
}

interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: string;
  timestamp: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MarketState {
  currentSymbol: string;
  connected: boolean;
  orderbook: {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
  };
  recentTrades: Trade[];
  candles: Candle[];
  ticker: {
    price: number;
    change24h: number;
  } | null;
  selectedPrice: number | null;
  selectedSide: 'buy' | 'sell' | null;
  setSymbol: (symbol: string) => void;
  setConnected: (connected: boolean) => void;
  updateOrderbook: (bids: [string, string][], asks: [string, string][], isSnapshot?: boolean) => void;
  addTrade: (trade: Trade) => void;
  setCandles: (candles: Candle[]) => void;
  updateCandle: (candle: Candle) => void;
  setTicker: (price: number) => void;
  clearData: () => void;
  setSelectedOrder: (price: number, side: 'buy' | 'sell') => void;
  clearSelectedOrder: () => void;
}

interface UserState {
  isAuthenticated: boolean;
  user: {
    id: string;
    email: string;
  } | null;
  token: string | null;
  balances: Record<string, { available: number; locked: number }>;
  setUser: (user: any, token?: string) => void;
  setBalances: (balances: any[]) => void;
  logout: () => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  currentSymbol: 'BTC/USDT',
  connected: false,
  orderbook: { bids: [], asks: [] },
  recentTrades: [],
  candles: [],
  ticker: null,
  selectedPrice: null,
  selectedSide: null,
  
  setSymbol: (symbol) => set({ currentSymbol: symbol }),
  
  setConnected: (connected) => set({ connected }),
  
  updateOrderbook: (bids, asks, isSnapshot = false) => set((state) => {
    const parseBids = bids.map(([p, q]) => {
      const price = parseFloat(p);
      const quantity = parseFloat(q);
      return { price, quantity, total: price * quantity };
    }).filter(l => l.quantity > 0).sort((a, b) => b.price - a.price);

    const parseAsks = asks.map(([p, q]) => {
      const price = parseFloat(p);
      const quantity = parseFloat(q);
      return { price, quantity, total: price * quantity };
    }).filter(l => l.quantity > 0).sort((a, b) => a.price - b.price);

    if (isSnapshot) {
      return {
        orderbook: {
          bids: parseBids.slice(0, 20),
          asks: parseAsks.slice(0, 20),
        }
      };
    }

    const bidMap = new Map(state.orderbook.bids.map(b => [b.price, b]));
    const askMap = new Map(state.orderbook.asks.map(a => [a.price, a]));

    for (const level of parseBids) {
      if (level.quantity === 0) {
        bidMap.delete(level.price);
      } else {
        bidMap.set(level.price, level);
      }
    }

    for (const level of parseAsks) {
      if (level.quantity === 0) {
        askMap.delete(level.price);
      } else {
        askMap.set(level.price, level);
      }
    }

    return {
      orderbook: {
        bids: Array.from(bidMap.values()).sort((a, b) => b.price - a.price).slice(0, 20),
        asks: Array.from(askMap.values()).sort((a, b) => a.price - b.price).slice(0, 20),
      }
    };
  }),
  
  addTrade: (trade) => set((state) => ({
    recentTrades: [trade, ...state.recentTrades].slice(0, 50),
    ticker: { price: trade.price, change24h: state.ticker?.change24h ?? 0 }
  })),
  
  setCandles: (candles) => set({ candles }),
  
  updateCandle: (candle) => set((state) => {
    const existing = state.candles.findIndex(c => c.time === candle.time);
    if (existing >= 0) {
      const updated = [...state.candles];
      updated[existing] = candle;
      return { candles: updated };
    }
    return { candles: [...state.candles, candle] };
  }),
  
  setTicker: (price) => set((state) => ({
    ticker: { price, change24h: state.ticker?.change24h ?? 0 }
  })),
  
  clearData: () => set({
    orderbook: { bids: [], asks: [] },
    recentTrades: [],
    candles: [],
  }),
  
  setSelectedOrder: (price, side) => set({ selectedPrice: price, selectedSide: side }),
  
  clearSelectedOrder: () => set({ selectedPrice: null, selectedSide: null }),
}));

export const useUserStore = create<UserState>((set) => ({
  isAuthenticated: false,
  user: null,
  token: null,
  balances: {},
  
  setUser: (user, token) => {
    if (token) {
      localStorage.setItem('token', token);
    }
    set({ user, token: token ?? null, isAuthenticated: !!user });
  },
  
  setBalances: (balancesList) => {
    const balances = balancesList.reduce((acc: Record<string, { available: number; locked: number }>, curr: any) => ({
      ...acc,
      [curr.asset]: { 
        available: parseFloat(curr.available), 
        locked: parseFloat(curr.locked) 
      }
    }), {});
    set({ balances });
  },
  
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false, balances: {} });
  },
}));
