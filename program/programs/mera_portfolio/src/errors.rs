use anchor_lang::prelude::*;

#[error_code]
pub enum PortfolioError {
    #[msg("Portfolio is paused")]
    PortfolioPaused,
    #[msg("Rule is paused")]
    RulePaused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Percent value must be between 1 and 100")]
    InvalidPercent,
    #[msg("Take-profit rules require action fields")]
    MissingTakeProfitFields,
    #[msg("Rule condition is not met; nothing to enforce")]
    ConditionNotMet,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid swap program")]
    InvalidSwapProgram,
    #[msg("Swap execution failed")]
    SwapFailed,
}
