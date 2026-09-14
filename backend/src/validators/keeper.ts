import { z } from 'zod'

export const keeperTickBodySchema = z.object({
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .optional(),
  dryRun: z.boolean().optional().default(true),
})

export const linkPortfolioBodySchema = z.object({
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  portfolioPda: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
})

export const linkRuleBodySchema = z.object({
  ruleId: z.string().uuid(),
  mint: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  portfolioPda: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  onChainRulePda: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  onChainRuleId: z.number().int().positive(),
})

export type KeeperTickBody = z.infer<typeof keeperTickBodySchema>
export type LinkPortfolioBody = z.infer<typeof linkPortfolioBodySchema>
export type LinkRuleBody = z.infer<typeof linkRuleBodySchema>
