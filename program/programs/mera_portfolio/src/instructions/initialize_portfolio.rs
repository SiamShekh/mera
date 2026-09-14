use anchor_lang::prelude::*;

use crate::state::{Portfolio, RuleEntry, MAX_RULES};

#[derive(Accounts)]
pub struct InitializePortfolio<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Portfolio::INIT_SPACE,
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump
    )]
    pub portfolio: Account<'info, Portfolio>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePortfolio>) -> Result<()> {
    let portfolio = &mut ctx.accounts.portfolio;
    let clock = Clock::get()?;

    portfolio.owner = ctx.accounts.owner.key();
    portfolio.bump = ctx.bumps.portfolio;
    portfolio.next_rule_id = 1;
    portfolio.paused = false;
    portfolio.created_at = clock.unix_timestamp;
    portfolio.rules = [RuleEntry::default(); MAX_RULES];

    Ok(())
}
