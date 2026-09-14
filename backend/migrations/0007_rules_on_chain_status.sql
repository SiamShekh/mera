-- Repair: 0004 was recorded as applied but on_chain_status never landed locally.
ALTER TABLE rules ADD COLUMN on_chain_status TEXT;
CREATE INDEX IF NOT EXISTS idx_rules_on_chain_status ON rules(on_chain_status);
