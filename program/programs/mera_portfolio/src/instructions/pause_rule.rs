use anchor_lang::prelude::*;

use crate::errors::PortfolioError;
use crate::state::{Portfolio, Rule};

#[derive(Accounts)]
pub struct PauseRule<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump = portfolio.bump,
        has_one = owner @ PortfolioError::Unauthorized
    )]
    pub portfolio: Account<'info, Portfolio>,

    #[account(
        mut,
        seeds = [
            Rule::SEED,
            portfolio.key().as_ref(),
            &rule.rule_id.to_le_bytes()
        ],
        bump = rule.bump,
        has_one = portfolio @ PortfolioError::Unauthorized
    )]
    pub rule: Account<'info, Rule>,
}

pub fn handler(ctx: Context<PauseRule>, paused: bool) -> Result<()> {
    ctx.accounts.rule.paused = paused;
    Ok(())
}
