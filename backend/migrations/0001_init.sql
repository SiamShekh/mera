-- D1 / SQLite-compatible initial schema
-- Applied via: npm run db:migrate:local | npm run db:migrate:remote

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY NOT NULL,
  address TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  compiled_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rules_wallet_id ON rules(wallet_id);
CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(status);
