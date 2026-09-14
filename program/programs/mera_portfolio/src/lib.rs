use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5");

#[program]
pub mod mera_portfolio {
    use super::*;

    pub fn initialize_portfolio(ctx: Context<InitializePortfolio>) -> Result<()> {
        instructions::initialize_portfolio::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    pub fn add_rule(ctx: Context<AddRule>, args: AddRuleArgs) -> Result<()> {
        instructions::add_rule::handler(ctx, args)
    }

    pub fn remove_rule(ctx: Context<RemoveRule>, rule_id: u8) -> Result<()> {
        instructions::remove_rule::handler(ctx, rule_id)
    }

    pub fn set_portfolio_paused(ctx: Context<SetPortfolioPaused>, paused: bool) -> Result<()> {
        instructions::set_portfolio_paused::handler(ctx, paused)
    }

    /// Keeper-callable: re-check rule by id, then optionally execute a Jupiter swap
    /// via remaining_accounts (vault PDA signs with seeds).
    pub fn enforce_rule(ctx: Context<EnforceRule>, args: EnforceArgs) -> Result<()> {
        instructions::enforce_rule::handler(ctx, args)
    }
}
