-- Repair: portfolios was created earlier with owner_address; schema expects user_address.
-- CREATE TABLE IF NOT EXISTS in 0004 did not rewrite the existing table.

CREATE TABLE portfolios_v2 (
  user_address TEXT PRIMARY KEY NOT NULL,
  portfolio_pda TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_address) REFERENCES users(address) ON DELETE CASCADE
);

INSERT INTO portfolios_v2 (user_address, portfolio_pda, created_at, updated_at)
SELECT owner_address, portfolio_pda, created_at, updated_at FROM portfolios;

DROP TABLE portfolios;
ALTER TABLE portfolios_v2 RENAME TO portfolios;
