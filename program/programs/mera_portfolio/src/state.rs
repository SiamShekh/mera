use anchor_lang::prelude::*;

/// Extensible rule kinds — add variants later without redesigning the vault.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RuleType {
    MinAllocation,
    MaxAllocation,
    TakeProfit,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RuleUnit {
    Percent,
    Amount,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SellBasis {
    Position,
    Portfolio,
}

#[account]
#[derive(InitSpace)]
pub struct Portfolio {
    pub owner: Pubkey,
    pub bump: u8,
    pub rule_count: u32,
    pub next_rule_id: u64,
    pub paused: bool,
    pub created_at: i64,
}

impl Portfolio {
    pub const SEED: &'static [u8] = b"portfolio";
}

#[account]
#[derive(InitSpace)]
pub struct Rule {
    pub portfolio: Pubkey,
    pub rule_id: u64,
    pub bump: u8,
    pub rule_type: RuleType,
    /// Asset mint this rule applies to (mock xStock, USDC, etc. on Devnet).
    pub mint: Pubkey,
    pub unit: RuleUnit,
    /// Cap / floor / profit threshold. Percent is basis points of 100_00 = 100.00%
    /// stored as whole percent * 100 for two decimals, OR raw percent integer 1..=100
    /// for V1 simplicity: value is whole percent (1-100) or raw token amount (smallest units).
    pub value: u64,
    pub action_unit: Option<RuleUnit>,
    pub action_value: Option<u64>,
    pub sell_basis: Option<SellBasis>,
    pub paused: bool,
    pub created_at: i64,
    /// Reserved for future rule kinds / params without account migration pain.
    pub params_version: u8,
}

impl Rule {
    pub const SEED: &'static [u8] = b"rule";
}
