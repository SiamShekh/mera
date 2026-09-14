use anchor_lang::prelude::*;

/// Max rules packed into one Portfolio PDA (one rent payment per user).
pub const MAX_RULES: usize = 8;

/// Extensible rule kinds — add variants later without redesigning the vault.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum RuleType {
    #[default]
    MinAllocation,
    MaxAllocation,
    TakeProfit,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum RuleUnit {
    #[default]
    Percent,
    Amount,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum SellBasis {
    #[default]
    Position,
    Portfolio,
}

/// Compact rule slot stored inside `Portfolio` (no separate Rule PDA).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Default)]
pub struct RuleEntry {
    pub id: u8,
    /// False = free / removed slot.
    pub active: bool,
    pub rule_type: RuleType,
    /// Asset mint this rule applies to.
    pub mint: Pubkey,
    pub unit: RuleUnit,
    /// Cap / floor / profit threshold. Percent: whole percent 1..=100; Amount: raw units.
    pub value: u64,
    pub action_unit: Option<RuleUnit>,
    pub action_value: Option<u64>,
    pub sell_basis: Option<SellBasis>,
}

#[account]
#[derive(InitSpace)]
pub struct Portfolio {
    pub owner: Pubkey,
    pub bump: u8,
    /// Next rule id to assign (starts at 1; wraps after 255).
    pub next_rule_id: u8,
    pub paused: bool,
    pub created_at: i64,
    pub rules: [RuleEntry; MAX_RULES],
}

impl Portfolio {
    pub const SEED: &'static [u8] = b"portfolio";

    pub fn find_rule_slot(&self, rule_id: u8) -> Option<usize> {
        self.rules
            .iter()
            .position(|r| r.active && r.id == rule_id)
    }

    pub fn find_free_slot(&self) -> Option<usize> {
        self.rules.iter().position(|r| !r.active)
    }
}
