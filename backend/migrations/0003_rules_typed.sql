-- Replace early wallet-scoped rules with user-scoped typed rules.
-- Supports percent (%) and absolute amount ($) for thresholds and actions.

DROP TABLE IF EXISTS rules;
DROP TABLE IF EXISTS wallets;

CREATE TABLE rules (
  id TEXT PRIMARY KEY NOT NULL,
  user_address TEXT NOT NULL,
  prompt TEXT,
  type TEXT NOT NULL CHECK (type IN ('max_allocation', 'min_allocation', 'take_profit')),
  asset TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('percent', 'amount')),
  value REAL NOT NULL,
  action_unit TEXT CHECK (action_unit IN ('percent', 'amount') OR action_unit IS NULL),
  action_value REAL,
  sell_basis TEXT CHECK (sell_basis IN ('position', 'portfolio') OR sell_basis IS NULL),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_address) REFERENCES users(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rules_user_address ON rules(user_address);
CREATE INDEX IF NOT EXISTS idx_rules_type ON rules(type);
CREATE INDEX IF NOT EXISTS idx_rules_status ON rules(status);
