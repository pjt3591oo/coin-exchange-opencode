# OpenCode Exchange

Production-grade cryptocurrency exchange with real-time orderbook, matching engine, and trading UI.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Frontend                            │
│                     (Next.js 14 + React)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │ REST API         │                  │ WebSocket
          ▼                  │                  ▼
   ┌─────────────┐           │           ┌─────────────┐
   │ API Gateway │           │           │ WS Gateway  │
   │  (Node.js)  │           │           │  (Node.js)  │
   └──────┬──────┘           │           └──────┬──────┘
          │                  │                  │
          └─────────┬────────┘                  │
                    ▼                           │
┌──────────────────────────────────────┐        │
│           KAFKA CLUSTER              │        │
│  orders │ trades │ orderbook-updates │        │
└──────────────────────────────────────┘        │
                    │                           │
                    ▼                           │
┌──────────────────────────────────────┐        │
│       MATCHING ENGINE (Go)           │        │
│  - Red-Black Tree Orderbook          │        │
│  - Price-Time Priority               │        │
│  - Single-Threaded (Deterministic)   │        │
└──────────────────────────────────────┘        │
                    │                           │
                    ▼                           │
┌──────────────────────────────────────┐        │
│     TRADE PROCESSOR (Node.js)        │◄───────┘
│  - Balance Settlement                │
│  - Order Status Updates              │
│  - Redis Pub/Sub Publishing          │
└──────────────────────────────────────┘
          │                   │
          ▼                   ▼
   ┌─────────────┐     ┌─────────────┐
   │ PostgreSQL  │     │    Redis    │
   └─────────────┘     └─────────────┘
```

## Features

- **Real-time Orderbook**: WebSocket streaming with snapshot + delta updates
- **High-Performance Matching Engine**: Go-based, single-threaded, price-time priority
- **Candlestick Charts**: TradingView Lightweight Charts with real-time updates
- **JWT Authentication**: Secure user registration and login with session persistence
- **Mock Trading**: Simulation mode with initial balances
- **Quick Order Entry**: Click orderbook row to auto-fill order form
- **Open Orders Management**: View and cancel pending orders

## Tech Stack

| Component | Technology |
|-----------|------------|
| API Gateway | Node.js, Express, TypeScript |
| Matching Engine | Go |
| Trade Processor | Node.js, TypeScript |
| WebSocket Gateway | Node.js, ws |
| Web Frontend | Next.js 14, React, Tailwind CSS |
| Database | PostgreSQL |
| Cache/Pub-Sub | Redis |
| Message Queue | Apache Kafka |

## Quick Start

### Prerequisites

- Node.js 20+
- Go 1.21+ (for matching engine)
- Docker & Docker Compose

### 1. Start Infrastructure

```bash
npm run docker:up
```

This starts PostgreSQL, Redis, Kafka, and Zookeeper.

### 2. Install Dependencies

```bash
npm install
```

### 3. Build Shared Packages

```bash
npm run build
```

### 4. Start Services

In separate terminals:

```bash
# Terminal 1: API Gateway
npm run dev:api

# Terminal 2: Trade Processor
npm run dev:trade

# Terminal 3: WebSocket Gateway
npm run dev:ws

# Terminal 4: OHLCV Aggregator
npm run dev:ohlcv

# Terminal 5: Matching Engine (Go)
cd matching-engine && go run cmd/engine/main.go

# Terminal 6: Web Frontend
npm run dev:web
```

### 5. Access the Exchange

- **Web UI**: http://localhost:3002
- **API**: http://localhost:3000/api/v1
- **WebSocket**: ws://localhost:3001
- **Kafka UI**: http://localhost:8080

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token

### Account
- `GET /api/v1/account/balances` - Get all balances
- `POST /api/v1/account/deposit` - Mock deposit
- `POST /api/v1/account/withdraw` - Mock withdraw

### Markets
- `GET /api/v1/markets` - List markets
- `GET /api/v1/markets/:symbol/orderbook` - Get orderbook
- `GET /api/v1/markets/:symbol/trades` - Recent trades
- `GET /api/v1/markets/:symbol/candles` - OHLCV data

### Orders
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders` - List orders
- `GET /api/v1/orders/:orderId` - Get order
- `DELETE /api/v1/orders/:orderId` - Cancel order

## WebSocket Channels

```javascript
// Subscribe to channels
ws.send(JSON.stringify({
  type: "subscribe",
  channels: ["orderbook:BTC/USDT", "trades:BTC/USDT", "candles:BTC/USDT:1m"]
}));

// Receive updates
// Orderbook: { type: "delta", bids: [[price, qty]], asks: [[price, qty]], sequence }
// Trade: { type: "trade", data: { id, price, quantity, side, timestamp } }
// Candle: { type: "candle", data: { openTime, open, high, low, close, volume, closed } }
```

## Trading Pairs

| Pair | Base | Quote |
|------|------|-------|
| BTC/USDT | Bitcoin | Tether |
| ETH/USDT | Ethereum | Tether |
| SOL/USDT | Solana | Tether |
| XRP/USDT | Ripple | Tether |

## Initial Balances (Mock Trading)

New users receive:
- 1,000,000 USDT
- 10 BTC
- 100 ETH
- 1,000 SOL
- 100,000 XRP

## Project Structure

```
opencode-exchange/
├── docker/                 # Docker Compose config
├── matching-engine/        # Go matching engine
├── migrations/             # PostgreSQL migrations
├── packages/               # Shared TypeScript packages
│   ├── config/
│   ├── errors/
│   ├── kafka/
│   ├── logger/
│   ├── redis/
│   └── types/
├── services/               # Backend services
│   ├── api-gateway/
│   ├── trade-processor/
│   ├── ws-gateway/
│   └── ohlcv-aggregator/
└── web/                    # Next.js frontend
```

## License

MIT
