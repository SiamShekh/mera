use anchor_lang::prelude::*;

use crate::errors::PortfolioError;
use crate::state::Portfolio;

#[derive(Accounts)]
pub struct PausePortfolio<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump = portfolio.bump,
        has_one = owner @ PortfolioError::Unauthorized
    )]
    pub portfolio: Account<'info, Portfolio>,
}

pub fn handler(ctx: Context<PausePortfolio>, paused: bool) -> Result<()> {
    ctx.accounts.portfolio.paused = paused;
    Ok(())
}
