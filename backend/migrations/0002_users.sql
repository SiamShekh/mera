-- Users: one row per connected Solana wallet (address = public key)
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
