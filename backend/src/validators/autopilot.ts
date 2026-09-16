import { z } from 'zod'

import { compiledRuleSchema } from './compile'
import { solanaAddressSchema } from './user'

export const autopilotTurnBodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  holdings: z
    .array(
      z.object({
        symbol: z.string().trim().min(1).max(32),
        quantity: z.number(),
        priceUsd: z.number(),
      }),
    )
    .max(50)
    .optional(),
  walletConnected: z.boolean().optional(),
  userAddress: solanaAddressSchema.optional(),
  pendingRule: compiledRuleSchema.optional().nullable(),
  pendingRules: z.array(compiledRuleSchema).max(20).optional().nullable(),
  pendingCancelIds: z.array(z.string().uuid()).max(20).optional(),
})

export type AutopilotTurnBody = z.infer<typeof autopilotTurnBodySchema>
