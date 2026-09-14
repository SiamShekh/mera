use anchor_lang::prelude::*;

use crate::errors::PortfolioError;
use crate::state::{Portfolio, RuleEntry};

#[derive(Accounts)]
pub struct RemoveRule<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump = portfolio.bump,
        has_one = owner @ PortfolioError::Unauthorized
    )]
    pub portfolio: Account<'info, Portfolio>,
}

pub fn handler(ctx: Context<RemoveRule>, rule_id: u8) -> Result<()> {
    let portfolio = &mut ctx.accounts.portfolio;
    let slot = portfolio
        .find_rule_slot(rule_id)
        .ok_or(PortfolioError::RuleNotFound)?;

    portfolio.rules[slot] = RuleEntry::default();
    Ok(())
}
