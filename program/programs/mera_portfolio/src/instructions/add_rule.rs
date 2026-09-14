use anchor_lang::prelude::*;

use crate::errors::PortfolioError;
use crate::state::{Portfolio, RuleEntry, RuleType, RuleUnit, SellBasis};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AddRuleArgs {
    pub rule_type: RuleType,
    pub mint: Pubkey,
    pub unit: RuleUnit,
    pub value: u64,
    pub action_unit: Option<RuleUnit>,
    pub action_value: Option<u64>,
    pub sell_basis: Option<SellBasis>,
}

#[derive(Accounts)]
pub struct AddRule<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump = portfolio.bump,
        has_one = owner @ PortfolioError::Unauthorized,
        constraint = !portfolio.paused @ PortfolioError::PortfolioPaused
    )]
    pub portfolio: Account<'info, Portfolio>,
}

pub fn handler(ctx: Context<AddRule>, args: AddRuleArgs) -> Result<()> {
    validate_args(&args)?;

    let portfolio = &mut ctx.accounts.portfolio;
    let slot = portfolio
        .find_free_slot()
        .ok_or(PortfolioError::RuleSlotsFull)?;

    let rule_id = portfolio.next_rule_id;
    require!(rule_id > 0, PortfolioError::MathOverflow);

    portfolio.rules[slot] = RuleEntry {
        id: rule_id,
        active: true,
        rule_type: args.rule_type,
        mint: args.mint,
        unit: args.unit,
        value: args.value,
        action_unit: args.action_unit,
        action_value: args.action_value,
        sell_basis: args.sell_basis,
    };

    portfolio.next_rule_id = rule_id
        .checked_add(1)
        .ok_or(PortfolioError::MathOverflow)?;

    Ok(())
}

fn validate_args(args: &AddRuleArgs) -> Result<()> {
    require!(args.value > 0, PortfolioError::InvalidAmount);

    if matches!(args.unit, RuleUnit::Percent) {
        require!(args.value <= 100, PortfolioError::InvalidPercent);
    }

    if matches!(args.rule_type, RuleType::TakeProfit) {
        let action_unit = args
            .action_unit
            .ok_or(PortfolioError::MissingTakeProfitFields)?;
        let action_value = args
            .action_value
            .ok_or(PortfolioError::MissingTakeProfitFields)?;
        require!(action_value > 0, PortfolioError::InvalidAmount);
        if matches!(action_unit, RuleUnit::Percent) {
            require!(action_value <= 100, PortfolioError::InvalidPercent);
        }
        require!(
            args.sell_basis.is_some(),
            PortfolioError::MissingTakeProfitFields
        );
    }

    Ok(())
}
