import { z } from 'zod'

export const keeperTickBodySchema = z.object({
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .optional(),
  /** Default false — Autopilot executes sells when conditions hit. */
  dryRun: z.boolean().optional().default(false),
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

/** Chat-time arm: user already deposited sell tokens to treasury. */
export const armAutopilotBodySchema = z.object({
  ruleId: z.string().uuid(),
  userAddress: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  sellMint: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  sellAmount: z.number().positive(),
  depositSignature: z.string().trim().min(32).max(128),
})

export type KeeperTickBody = z.infer<typeof keeperTickBodySchema>
export type LinkPortfolioBody = z.infer<typeof linkPortfolioBodySchema>
export type LinkRuleBody = z.infer<typeof linkRuleBodySchema>
export type ArmAutopilotBody = z.infer<typeof armAutopilotBodySchema>
