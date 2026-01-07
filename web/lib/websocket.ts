import { useMarketStore } from '@/store';

class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions: string[] = [];

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket('ws://localhost:3001');

    this.ws.onopen = () => {
      console.log('Connected to WebSocket');
      if (this.subscriptions.length > 0) {
        this.subscribe(this.subscriptions);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(channels: string[]) {
    this.subscriptions = channels;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channels }));
    }
  }

  private handleMessage(message: any) {
    const { updateOrderbook, addTrade, setConnected, updateCandle } = useMarketStore.getState();

    switch (message.type) {
      case 'connected':
        console.log('WebSocket connected:', message.clientId);
        setConnected(true);
        break;

      case 'subscribed':
        console.log('Subscribed to channels:', message.channels);
        break;

      case 'snapshot':
        if (message.bids && message.asks) {
          updateOrderbook(message.bids, message.asks, true);
        }
        break;

      case 'delta':
        if (message.bids || message.asks) {
          updateOrderbook(message.bids || [], message.asks || [], false);
        }
        break;

      case 'trade':
        if (message.data) {
          addTrade({
            id: message.data.id,
            price: parseFloat(message.data.price),
            quantity: parseFloat(message.data.quantity),
            side: message.data.side,
            timestamp: message.data.timestamp,
          });
        }
        break;

      case 'candle':
        if (message.data) {
          updateCandle({
            time: message.data.openTime,
            open: parseFloat(message.data.open),
            high: parseFloat(message.data.high),
            low: parseFloat(message.data.low),
            close: parseFloat(message.data.close),
          });
        }
        break;

      case 'error':
        console.error('WebSocket error:', message.message);
        break;

      default:
        console.log('Unknown message type:', message.type, message);
    }
  }

  private reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }
}

export const wsManager = new WebSocketManager();
