-- Autopilot: escrow at chat-time, execute when price hits (mint column already exists)
ALTER TABLE rules ADD COLUMN escrow_sell_amount REAL;
ALTER TABLE rules ADD COLUMN escrow_deposit_sig TEXT;
ALTER TABLE rules ADD COLUMN executed_at TEXT;
ALTER TABLE rules ADD COLUMN execution_txid TEXT;
ALTER TABLE rules ADD COLUMN execution_note TEXT;
