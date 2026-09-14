use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

use crate::errors::PortfolioError;
use crate::state::{Portfolio, RuleEntry, RuleType, RuleUnit};

/// Optional Mainnet Jupiter v6 id — unused on Devnet (mock / empty swap path).
#[allow(dead_code)]
pub const JUPITER_V6_PROGRAM_ID: Pubkey =
    pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EnforceArgs {
    /// Rule id packed inside the Portfolio account.
    pub rule_id: u8,
    /// Current USD value of the rule mint holdings in the vault (6 decimals).
    pub asset_value_usd: u64,
    /// Current USD value of the whole vault (6 decimals).
    pub portfolio_value_usd: u64,
    /// Optional: unrealized profit percent for take-profit (V1: 0..=100).
    pub profit_percent: Option<u64>,
    /// Raw swap instruction data to CPI when a rebalance is required.
    /// Empty on Devnet = condition checked, no token move (hackathon mock).
    pub swap_ix_data: Vec<u8>,
}

#[derive(Accounts)]
pub struct EnforceRule<'info> {
    /// Keeper pays fees and triggers automation. Not the portfolio owner.
    pub keeper: Signer<'info>,

    #[account(
        seeds = [Portfolio::SEED, portfolio.owner.as_ref()],
        bump = portfolio.bump,
        constraint = !portfolio.paused @ PortfolioError::PortfolioPaused
    )]
    pub portfolio: Account<'info, Portfolio>,

    /// Vault ATA for the rule mint (mint checked in handler after resolving rule).
    #[account(
        mut,
        token::authority = portfolio,
        token::token_program = token_program
    )]
    pub vault_asset_ata: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: External swap program when `swap_ix_data` is non-empty.
    /// On Devnet pass the system program (or any account) and leave swap data empty.
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<EnforceRule>, args: EnforceArgs) -> Result<()> {
    let slot = ctx
        .accounts
        .portfolio
        .find_rule_slot(args.rule_id)
        .ok_or(PortfolioError::RuleNotFound)?;
    let rule = ctx.accounts.portfolio.rules[slot];
    require!(rule.active, PortfolioError::RuleInactive);

    require!(
        ctx.accounts.vault_asset_ata.mint == rule.mint,
        PortfolioError::Unauthorized
    );

    let should_swap = condition_met(&rule, &args)?;
    require!(should_swap, PortfolioError::ConditionNotMet);

    // Devnet hackathon path: prove the rule fired without requiring Jupiter liquidity.
    if args.swap_ix_data.is_empty() {
        return Ok(());
    }

    require!(
        !ctx.remaining_accounts.is_empty(),
        PortfolioError::InvalidSwapProgram
    );

    let owner = ctx.accounts.portfolio.owner;
    let seeds: &[&[u8]] = &[
        Portfolio::SEED,
        owner.as_ref(),
        &[ctx.accounts.portfolio.bump],
    ];
    let signer_seeds = &[seeds];

    let mut account_metas: Vec<AccountMeta> = Vec::with_capacity(ctx.remaining_accounts.len());

    for account in ctx.remaining_accounts.iter() {
        account_metas.push(if account.is_writable {
            AccountMeta::new(*account.key, account.is_signer)
        } else {
            AccountMeta::new_readonly(*account.key, account.is_signer)
        });
    }

    for meta in account_metas.iter_mut() {
        if meta.pubkey == ctx.accounts.portfolio.key() {
            meta.is_signer = true;
        }
    }

    let ix = Instruction {
        program_id: ctx.accounts.jupiter_program.key(),
        accounts: account_metas,
        data: args.swap_ix_data,
    };

    invoke_signed(&ix, ctx.remaining_accounts, signer_seeds)
        .map_err(|_| PortfolioError::SwapFailed)?;

    Ok(())
}

fn condition_met(rule: &RuleEntry, args: &EnforceArgs) -> Result<bool> {
    require!(args.portfolio_value_usd > 0, PortfolioError::InvalidAmount);

    match rule.rule_type {
        RuleType::MinAllocation => match rule.unit {
            RuleUnit::Percent => {
                let pct = args
                    .asset_value_usd
                    .checked_mul(100)
                    .ok_or(PortfolioError::MathOverflow)?
                    .checked_div(args.portfolio_value_usd)
                    .ok_or(PortfolioError::MathOverflow)?;
                Ok(pct < rule.value)
            }
            RuleUnit::Amount => Ok(args.asset_value_usd < rule.value),
        },
        RuleType::MaxAllocation => match rule.unit {
            RuleUnit::Percent => {
                let pct = args
                    .asset_value_usd
                    .checked_mul(100)
                    .ok_or(PortfolioError::MathOverflow)?
                    .checked_div(args.portfolio_value_usd)
                    .ok_or(PortfolioError::MathOverflow)?;
                Ok(pct > rule.value)
            }
            RuleUnit::Amount => Ok(args.asset_value_usd > rule.value),
        },
        RuleType::TakeProfit => {
            let profit = args
                .profit_percent
                .ok_or(PortfolioError::MissingTakeProfitFields)?;
            Ok(profit >= rule.value)
        }
    }
}
