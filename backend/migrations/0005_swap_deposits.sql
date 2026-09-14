-- Replay protection for Devnet mock swap deposits.
CREATE TABLE IF NOT EXISTS swap_deposits (
  signature TEXT PRIMARY KEY NOT NULL,
  user_address TEXT NOT NULL,
  sell_mint TEXT NOT NULL,
  buy_mint TEXT NOT NULL,
  sell_amount TEXT NOT NULL,
  buy_amount TEXT NOT NULL,
  payout_signature TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
