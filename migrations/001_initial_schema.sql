-- ============================================
-- OpenCode Exchange - Initial Schema
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
                    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_status ON users (status) WHERE status = 'ACTIVE';

-- ============================================
-- ASSETS & MARKETS
-- ============================================

CREATE TABLE assets (
    id              VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    decimals        SMALLINT NOT NULL DEFAULT 8,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELISTED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE markets (
    id              VARCHAR(20) PRIMARY KEY,
    base_asset      VARCHAR(20) NOT NULL REFERENCES assets(id),
    quote_asset     VARCHAR(20) NOT NULL REFERENCES assets(id),
    price_decimals  SMALLINT NOT NULL DEFAULT 2,
    qty_decimals    SMALLINT NOT NULL DEFAULT 6,
    min_qty         DECIMAL(20,8) NOT NULL DEFAULT 0.0001,
    max_qty         DECIMAL(20,8) NOT NULL DEFAULT 1000000,
    min_notional    DECIMAL(20,8) NOT NULL DEFAULT 10,
    maker_fee       DECIMAL(10,6) NOT NULL DEFAULT 0.001,
    taker_fee       DECIMAL(10,6) NOT NULL DEFAULT 0.001,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'HALTED', 'DELISTED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_markets_status ON markets (status) WHERE status = 'ACTIVE';

-- ============================================
-- ACCOUNT BALANCES (with optimistic locking)
-- ============================================

CREATE TABLE account_balances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(20) NOT NULL REFERENCES assets(id),
    available       DECIMAL(38,18) NOT NULL DEFAULT 0 CHECK (available >= 0),
    locked          DECIMAL(38,18) NOT NULL DEFAULT 0 CHECK (locked >= 0),
    version         BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (user_id, asset)
);

CREATE INDEX idx_account_balances_user ON account_balances (user_id);

-- ============================================
-- BALANCE ENTRIES (Immutable Ledger)
-- ============================================

CREATE TABLE balance_entries (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    asset           VARCHAR(20) NOT NULL REFERENCES assets(id),
    amount          DECIMAL(38,18) NOT NULL,
    balance_after   DECIMAL(38,18) NOT NULL,
    entry_type      VARCHAR(20) NOT NULL 
                    CHECK (entry_type IN ('DEPOSIT', 'WITHDRAW', 'LOCK', 'UNLOCK', 'TRADE_CREDIT', 'TRADE_DEBIT', 'FEE')),
    reference_type  VARCHAR(20) NOT NULL,
    reference_id    VARCHAR(50) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_balance_entries_user ON balance_entries (user_id, created_at DESC);
CREATE INDEX idx_balance_entries_ref ON balance_entries (reference_type, reference_id);

-- ============================================
-- ORDERS
-- ============================================

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_order_id VARCHAR(100),
    user_id         UUID NOT NULL REFERENCES users(id),
    symbol          VARCHAR(20) NOT NULL REFERENCES markets(id),
    side            VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type            VARCHAR(10) NOT NULL CHECK (type IN ('LIMIT', 'MARKET')),
    price           DECIMAL(20,8),
    quantity        DECIMAL(20,8) NOT NULL CHECK (quantity > 0),
    filled_qty      DECIMAL(20,8) NOT NULL DEFAULT 0,
    remaining_qty   DECIMAL(20,8) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'NEW'
                    CHECK (status IN ('NEW', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (user_id, client_order_id)
);

-- Critical indexes for order queries
CREATE INDEX idx_orders_book ON orders (symbol, side, price, created_at)
    WHERE status IN ('NEW', 'PARTIAL');
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_user_symbol ON orders (user_id, symbol, created_at DESC);
CREATE INDEX idx_orders_active ON orders (symbol, status, price, created_at)
    WHERE status IN ('NEW', 'PARTIAL');

-- ============================================
-- TRADES
-- ============================================

CREATE TABLE trades (
    id              BIGSERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL REFERENCES markets(id),
    price           DECIMAL(20,8) NOT NULL,
    quantity        DECIMAL(20,8) NOT NULL,
    quote_qty       DECIMAL(20,8) NOT NULL,
    maker_order_id  UUID NOT NULL REFERENCES orders(id),
    taker_order_id  UUID NOT NULL REFERENCES orders(id),
    maker_user_id   UUID NOT NULL REFERENCES users(id),
    taker_user_id   UUID NOT NULL REFERENCES users(id),
    is_buyer_maker  BOOLEAN NOT NULL,
    maker_fee       DECIMAL(20,8) NOT NULL DEFAULT 0,
    taker_fee       DECIMAL(20,8) NOT NULL DEFAULT 0,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_symbol_time ON trades (symbol, executed_at DESC);
CREATE INDEX idx_trades_maker ON trades (maker_order_id);
CREATE INDEX idx_trades_taker ON trades (taker_order_id);
CREATE INDEX idx_trades_user_maker ON trades (maker_user_id, executed_at DESC);
CREATE INDEX idx_trades_user_taker ON trades (taker_user_id, executed_at DESC);

-- ============================================
-- OHLCV CANDLES
-- ============================================

CREATE TABLE candles (
    symbol          VARCHAR(20) NOT NULL REFERENCES markets(id),
    timeframe       VARCHAR(10) NOT NULL,
    open_time       TIMESTAMPTZ NOT NULL,
    open            DECIMAL(20,8) NOT NULL,
    high            DECIMAL(20,8) NOT NULL,
    low             DECIMAL(20,8) NOT NULL,
    close           DECIMAL(20,8) NOT NULL,
    volume          DECIMAL(30,8) NOT NULL,
    quote_volume    DECIMAL(30,8) NOT NULL,
    trade_count     INTEGER NOT NULL DEFAULT 0,
    closed          BOOLEAN NOT NULL DEFAULT FALSE,
    
    PRIMARY KEY (symbol, timeframe, open_time)
);

CREATE INDEX idx_candles_lookup ON candles (symbol, timeframe, open_time DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_account_balances_updated_at
    BEFORE UPDATE ON account_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA
-- ============================================

-- Insert assets
INSERT INTO assets (id, name, decimals) VALUES
    ('BTC', 'Bitcoin', 8),
    ('ETH', 'Ethereum', 8),
    ('USDT', 'Tether USD', 6),
    ('SOL', 'Solana', 8),
    ('XRP', 'Ripple', 6);

-- Insert markets (USDT pairs)
INSERT INTO markets (id, base_asset, quote_asset, price_decimals, qty_decimals, min_qty, min_notional) VALUES
    ('BTC/USDT', 'BTC', 'USDT', 2, 6, 0.00001, 10),
    ('ETH/USDT', 'ETH', 'USDT', 2, 5, 0.0001, 10),
    ('SOL/USDT', 'SOL', 'USDT', 2, 2, 0.01, 10),
    ('XRP/USDT', 'XRP', 'USDT', 4, 1, 1, 10);
