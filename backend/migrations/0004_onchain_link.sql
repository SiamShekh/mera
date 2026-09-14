-- Link off-chain drafts to on-chain portfolio vault + rule PDAs

ALTER TABLE rules ADD COLUMN mint TEXT;
ALTER TABLE rules ADD COLUMN portfolio_pda TEXT;
ALTER TABLE rules ADD COLUMN on_chain_rule_pda TEXT;
ALTER TABLE rules ADD COLUMN on_chain_rule_id INTEGER;
ALTER TABLE rules ADD COLUMN on_chain_status TEXT;

CREATE TABLE IF NOT EXISTS portfolios (
  user_address TEXT PRIMARY KEY NOT NULL,
  portfolio_pda TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_address) REFERENCES users(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rules_portfolio_pda ON rules(portfolio_pda);
CREATE INDEX IF NOT EXISTS idx_rules_on_chain_status ON rules(on_chain_status);
