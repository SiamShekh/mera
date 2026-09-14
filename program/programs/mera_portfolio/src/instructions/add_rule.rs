use anchor_lang::prelude::*;

use crate::errors::PortfolioError;
use crate::state::{Portfolio, Rule, RuleType, RuleUnit, SellBasis};

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
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Portfolio::SEED, owner.key().as_ref()],
        bump = portfolio.bump,
        has_one = owner @ PortfolioError::Unauthorized,
        constraint = !portfolio.paused @ PortfolioError::PortfolioPaused
    )]
    pub portfolio: Account<'info, Portfolio>,

    #[account(
        init,
        payer = owner,
        space = 8 + Rule::INIT_SPACE,
        seeds = [
            Rule::SEED,
            portfolio.key().as_ref(),
            &portfolio.next_rule_id.to_le_bytes()
        ],
        bump
    )]
    pub rule: Account<'info, Rule>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddRule>, args: AddRuleArgs) -> Result<()> {
    validate_args(&args)?;

    let portfolio = &mut ctx.accounts.portfolio;
    let rule = &mut ctx.accounts.rule;
    let clock = Clock::get()?;
    let rule_id = portfolio.next_rule_id;

    rule.portfolio = portfolio.key();
    rule.rule_id = rule_id;
    rule.bump = ctx.bumps.rule;
    rule.rule_type = args.rule_type;
    rule.mint = args.mint;
    rule.unit = args.unit;
    rule.value = args.value;
    rule.action_unit = args.action_unit;
    rule.action_value = args.action_value;
    rule.sell_basis = args.sell_basis;
    rule.paused = false;
    rule.created_at = clock.unix_timestamp;
    rule.params_version = 1;

    portfolio.next_rule_id = rule_id
        .checked_add(1)
        .ok_or(PortfolioError::MathOverflow)?;
    portfolio.rule_count = portfolio
        .rule_count
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
