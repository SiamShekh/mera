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

    pub fn pause_rule(ctx: Context<PauseRule>) -> Result<()> {
        instructions::pause_rule::handler(ctx, true)
    }

    pub fn resume_rule(ctx: Context<PauseRule>) -> Result<()> {
        instructions::pause_rule::handler(ctx, false)
    }

    pub fn pause_portfolio(ctx: Context<PausePortfolio>) -> Result<()> {
        instructions::pause_portfolio::handler(ctx, true)
    }

    pub fn resume_portfolio(ctx: Context<PausePortfolio>) -> Result<()> {
        instructions::pause_portfolio::handler(ctx, false)
    }

    /// Keeper-callable: re-check rule, then optionally execute a Jupiter swap
    /// via remaining_accounts (vault PDA signs with seeds).
    pub fn enforce_rule(ctx: Context<EnforceRule>, args: EnforceArgs) -> Result<()> {
        instructions::enforce_rule::handler(ctx, args)
    }
}
