import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

/**
 * App user = connected Solana wallet.
 * On Solana the wallet address is the public key (base58).
 */
export const users = sqliteTable('users', {
  address: text('address').primaryKey().notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

/** On-chain portfolio vault PDA linked to a user (created when they initialize). */
export const portfolios = sqliteTable('portfolios', {
  userAddress: text('user_address')
    .primaryKey()
    .notNull()
    .references(() => users.address, { onDelete: 'cascade' }),
  portfolioPda: text('portfolio_pda').notNull().unique(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

/**
 * Portfolio rules owned by a user.
 * Off-chain draft/history; executable when linked to on-chain rule PDA.
 */
export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey().notNull(),
    userAddress: text('user_address')
      .notNull()
      .references(() => users.address, { onDelete: 'cascade' }),
    prompt: text('prompt'),
    type: text('type', {
      enum: ['max_allocation', 'min_allocation', 'take_profit'],
    }).notNull(),
    asset: text('asset').notNull(),
    unit: text('unit', { enum: ['percent', 'amount'] }).notNull(),
    value: real('value').notNull(),
    actionUnit: text('action_unit', { enum: ['percent', 'amount'] }),
    actionValue: real('action_value'),
    sellBasis: text('sell_basis', { enum: ['position', 'portfolio'] }),
    status: text('status', { enum: ['draft', 'active', 'paused'] })
      .notNull()
      .default('active'),
    /** SPL / Token-2022 mint for the rule asset. */
    mint: text('mint'),
    portfolioPda: text('portfolio_pda'),
    onChainRulePda: text('on_chain_rule_pda'),
    onChainRuleId: integer('on_chain_rule_id'),
    onChainStatus: text('on_chain_status', {
      enum: ['pending', 'active', 'paused', 'failed'],
    }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_rules_user_address').on(table.userAddress),
    index('idx_rules_type').on(table.type),
    index('idx_rules_status').on(table.status),
    index('idx_rules_portfolio_pda').on(table.portfolioPda),
    index('idx_rules_on_chain_status').on(table.onChainStatus),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Portfolio = typeof portfolios.$inferSelect
export type NewPortfolio = typeof portfolios.$inferInsert
export type Rule = typeof rules.$inferSelect
export type NewRule = typeof rules.$inferInsert
export type RuleType = Rule['type']
export type RuleUnit = Rule['unit']

/** Prevents replaying the same swap deposit signature. */
export const swapDeposits = sqliteTable('swap_deposits', {
  signature: text('signature').primaryKey().notNull(),
  userAddress: text('user_address').notNull(),
  sellMint: text('sell_mint').notNull(),
  buyMint: text('buy_mint').notNull(),
  sellAmount: text('sell_amount').notNull(),
  buyAmount: text('buy_amount').notNull(),
  payoutSignature: text('payout_signature'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export type SwapDeposit = typeof swapDeposits.$inferSelect
export type NewSwapDeposit = typeof swapDeposits.$inferInsert

/** Live simulated USD prices for Devnet mock assets. */
export const mockPrices = sqliteTable('mock_prices', {
  mint: text('mint').primaryKey().notNull(),
  symbol: text('symbol').notNull(),
  priceUsd: real('price_usd').notNull(),
  anchorUsd: real('anchor_usd').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

/** Recent price samples for ticker / sparklines. */
export const priceTicks = sqliteTable(
  'price_ticks',
  {
    id: text('id').primaryKey().notNull(),
    mint: text('mint').notNull(),
    priceUsd: real('price_usd').notNull(),
    changePct: real('change_pct').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_price_ticks_mint_created').on(table.mint, table.createdAt),
  ],
)

export type MockPrice = typeof mockPrices.$inferSelect
export type PriceTick = typeof priceTicks.$inferSelect
