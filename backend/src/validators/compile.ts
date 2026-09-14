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

const takeProfitCompiled = z
  .object({
    type: z.literal('take_profit'),
    asset: assetField,
    unit: unitSchema,
    value: z.number(),
    actionUnit: unitSchema,
    actionValue: z.number(),
    sellBasis: z.enum(['position', 'portfolio']).default('position'),
  })
  .superRefine((data, ctx) => {
    for (const [path, unit, value] of [
      ['value', data.unit, data.value],
      ['actionValue', data.actionUnit, data.actionValue],
    ] as const) {
      const parsed = percentOrAmount.safeParse({ unit, value })
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ ...issue, path: [path] })
        }
      }
    }
  })

export const compiledRuleSchema = z.union([
  maxAllocationCompiled,
  minAllocationCompiled,
  takeProfitCompiled,
])

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
