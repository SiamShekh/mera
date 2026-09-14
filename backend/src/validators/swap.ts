import { z } from 'zod'

import { solanaAddressSchema } from './user'

export const swapCompleteBodySchema = z.object({
  userAddress: solanaAddressSchema,
  sellMint: z.string().min(32).max(64),
  buyMint: z.string().min(32).max(64),
  sellAmount: z.number().positive().max(1_000_000_000),
  depositSignature: z.string().min(64).max(128),
})

export const swapFaucetBodySchema = z.object({
  userAddress: solanaAddressSchema,
})

export type SwapCompleteBody = z.infer<typeof swapCompleteBodySchema>
export type SwapFaucetBody = z.infer<typeof swapFaucetBodySchema>
