import { z } from 'zod'

import { normalizeAsset } from '../ai/assets'

const unitSchema = z.enum(['percent', 'amount'])

const percentOrAmount = z
  .object({
    unit: unitSchema,
    value: z.number(),
  })
  .superRefine(({ unit, value }, ctx) => {
    if (!(value > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Value must be greater than 0',
      })
      return
    }
    if (unit === 'percent' && value > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Percent cannot exceed 100',
      })
    }
  })

/** Any plausible ticker — not a fixed allowlist. */
const assetField = z
  .string()
  .trim()
  .min(1, 'Asset is required')
  .max(32)
  .transform((raw, ctx) => {
    const normalized = normalizeAsset(raw)
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid asset ticker "${raw}".`,
      })
      return z.NEVER
    }
    return normalized
  })

const maxAllocationCompiled = z
  .object({
    type: z.literal('max_allocation'),
    asset: assetField,
    unit: unitSchema,
    value: z.number(),
  })
  .superRefine((data, ctx) => {
    const parsed = percentOrAmount.safeParse({
      unit: data.unit,
      value: data.value,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['value'] })
      }
    }
  })

const minAllocationCompiled = z
  .object({
    type: z.literal('min_allocation'),
    asset: assetField,
    unit: unitSchema,
    value: z.number(),
  })
  .superRefine((data, ctx) => {
    const parsed = percentOrAmount.safeParse({
      unit: data.unit,
      value: data.value,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['value'] })
      }
    }
  })

const sellSideCompiled = z
  .object({
    type: z.enum(['take_profit', 'stop_loss']),
    asset: assetField,
    unit: unitSchema,
    value: z.number(),
    actionUnit: unitSchema,
    actionValue: z.number(),
    sellBasis: z.enum(['position', 'portfolio']).default('position'),
  })
  .superRefine((data, ctx) => {
    // Absolute price: value >= 0 (0 = market / sell now for take_profit).
    // stop_loss amount must be > 0 (a floor price). Profit/loss %: value > 0 and <= 100.
    if (data.unit === 'amount') {
      if (data.type === 'stop_loss' && !(data.value > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Stop-loss price must be greater than 0',
        })
      } else if (data.value < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'Price trigger cannot be negative',
        })
      }
    } else {
      const parsed = percentOrAmount.safeParse({
        unit: data.unit,
        value: data.value,
      })
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ ...issue, path: ['value'] })
        }
      }
    }

    const actionParsed = percentOrAmount.safeParse({
      unit: data.actionUnit,
      value: data.actionValue,
    })
    if (!actionParsed.success) {
      for (const issue of actionParsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['actionValue'] })
      }
    }
  })

const buySideCompiled = z
  .object({
    type: z.enum(['market_buy', 'limit_buy']),
    asset: assetField,
    unit: z.literal('amount'),
    /** Share / token quantity to buy. */
    value: z.number().positive(),
    payAsset: assetField,
    /** Required for limit_buy; ignored / null for market_buy. */
    limitPrice: z.number().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'limit_buy') {
      if (!(data.limitPrice != null && data.limitPrice > 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['limitPrice'],
          message: 'Limit buy needs a USD limit price',
        })
      }
    }
  })

export const compiledRuleSchema = z.union([
  maxAllocationCompiled,
  minAllocationCompiled,
  sellSideCompiled,
  buySideCompiled,
])

/** Sell-side rules that escrow the asset and fill into USDC. */
export function isSellSideRule(
  rule: CompiledRule,
): rule is Extract<CompiledRule, { type: 'take_profit' | 'stop_loss' }> {
  return rule.type === 'take_profit' || rule.type === 'stop_loss'
}

/** Buy-side rules that escrow payAsset and fill into the target asset. */
export function isBuySideRule(
  rule: CompiledRule,
): rule is Extract<CompiledRule, { type: 'market_buy' | 'limit_buy' }> {
  return rule.type === 'market_buy' || rule.type === 'limit_buy'
}

/** Rules that need wallet escrow before the keeper can fill. */
export function isEscrowRule(
  rule: CompiledRule,
): rule is Extract<
  CompiledRule,
  { type: 'take_profit' | 'stop_loss' | 'market_buy' | 'limit_buy' }
> {
  return isSellSideRule(rule) || isBuySideRule(rule)
}

export const compiledRejectionSchema = z.object({
  rejection: z.object({
    code: z.enum([
      'ambiguous',
      'unsafe',
      'unsupported',
      'invalid_percent',
      'missing_details',
    ]),
    message: z.string().min(1),
  }),
})

export const llmCompileOutputSchema = z.union([
  compiledRuleSchema,
  compiledRejectionSchema,
])

export const compilePromptBodySchema = z.object({
  prompt: z.string().trim().min(3, 'Prompt is too short').max(1000),
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address'),
  /** Optional live holdings from the wallet — soft hints for the model only. */
  holdings: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
})

export const validateCompiledBodySchema = z.object({
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address'),
  prompt: z.string().trim().min(1).max(1000).optional(),
  rule: compiledRuleSchema,
})

export const confirmRuleBodySchema = z.object({
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address'),
  prompt: z.string().trim().min(1).max(1000).optional(),
  rule: compiledRuleSchema,
  status: z.enum(['draft', 'active']).default('active'),
})

export type CompiledRule = z.infer<typeof compiledRuleSchema>
export type CompiledRuleRejection = z.infer<typeof compiledRejectionSchema>
export type CompilePromptBody = z.infer<typeof compilePromptBodySchema>
export type ValidateCompiledBody = z.infer<typeof validateCompiledBodySchema>
export type ConfirmRuleBody = z.infer<typeof confirmRuleBodySchema>
