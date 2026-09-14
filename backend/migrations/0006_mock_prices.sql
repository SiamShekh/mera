-- Automatic mock price oracle (Devnet simulation).
CREATE TABLE IF NOT EXISTS mock_prices (
  mint TEXT PRIMARY KEY NOT NULL,
  symbol TEXT NOT NULL,
  price_usd REAL NOT NULL,
  anchor_usd REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_ticks (
  id TEXT PRIMARY KEY NOT NULL,
  mint TEXT NOT NULL,
  price_usd REAL NOT NULL,
  change_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_ticks_mint_created
  ON price_ticks (mint, created_at DESC);
