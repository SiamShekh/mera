import { z } from 'zod'

import { solanaAddressSchema } from './user'

const assetSchema = z
  .string()
  .trim()
  .min(1, 'Asset ticker is required')
  .max(32)
  .transform((s) => s.toUpperCase())

const unitSchema = z.enum(['percent', 'amount'])

const thresholdSchema = z
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

const allocationSchema = z
  .object({
    type: z.enum(['max_allocation', 'min_allocation']),
    userAddress: solanaAddressSchema,
    prompt: z.string().trim().min(1).optional(),
    asset: assetSchema,
    unit: unitSchema,
    value: z.number(),
    status: z.enum(['draft', 'active', 'paused']).default('active'),
  })
  .superRefine((data, ctx) => {
    const parsed = thresholdSchema.safeParse({
      unit: data.unit,
      value: data.value,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['value'] })
      }
    }
  })

const takeProfitSchema = z
  .object({
    type: z.literal('take_profit'),
    userAddress: solanaAddressSchema,
    prompt: z.string().trim().min(1).optional(),
    asset: assetSchema,
    unit: unitSchema,
    value: z.number(),
    actionUnit: unitSchema,
    actionValue: z.number(),
    sellBasis: z.enum(['position', 'portfolio']).default('position'),
    status: z.enum(['draft', 'active', 'paused']).default('active'),
  })
  .superRefine((data, ctx) => {
    const trigger = thresholdSchema.safeParse({
      unit: data.unit,
      value: data.value,
    })
    if (!trigger.success) {
      for (const issue of trigger.error.issues) {
        ctx.addIssue({ ...issue, path: ['value'] })
      }
    }

    const action = thresholdSchema.safeParse({
      unit: data.actionUnit,
      value: data.actionValue,
    })
    if (!action.success) {
      for (const issue of action.error.issues) {
        ctx.addIssue({ ...issue, path: ['actionValue'] })
      }
    }
  })

/** Union of the three rule shapes (A/B allocation + C take-profit). */
export const createRuleBodySchema = z.union([
  allocationSchema,
  takeProfitSchema,
])

export const listRulesQuerySchema = z.object({
  userAddress: solanaAddressSchema,
  status: z.enum(['draft', 'active', 'paused']).optional(),
})

export const ruleIdParamSchema = z.object({
  id: z.string().uuid('Invalid rule id'),
})

export const updateRuleBodySchema = z
  .object({
    status: z.enum(['draft', 'active', 'paused']).optional(),
    prompt: z.string().trim().min(1).optional(),
    asset: assetSchema.optional(),
    unit: unitSchema.optional(),
    value: z.number().optional(),
    actionUnit: unitSchema.optional(),
    actionValue: z.number().optional(),
    sellBasis: z.enum(['position', 'portfolio']).optional(),
  })
  .refine(
    (body) =>
      body.status !== undefined ||
      body.prompt !== undefined ||
      body.asset !== undefined ||
      body.unit !== undefined ||
      body.value !== undefined ||
      body.actionUnit !== undefined ||
      body.actionValue !== undefined ||
      body.sellBasis !== undefined,
    { message: 'Provide at least one field to update' },
  )
  .superRefine((body, ctx) => {
    if (body.unit !== undefined && body.value !== undefined) {
      const parsed = thresholdSchema.safeParse({
        unit: body.unit,
        value: body.value,
      })
      if (!parsed.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: parsed.error.issues[0]?.message ?? 'Invalid value',
        })
      }
    }
  })

export type CreateRuleBody = z.infer<typeof createRuleBodySchema>
export type UpdateRuleBody = z.infer<typeof updateRuleBodySchema>
export type ListRulesQuery = z.infer<typeof listRulesQuerySchema>
