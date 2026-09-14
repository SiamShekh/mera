import { z } from 'zod'

/** Solana wallet address = base58-encoded public key. */
export const solanaAddressSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address')

export const createUserBodySchema = z.object({
  address: solanaAddressSchema,
})

export const userAddressParamSchema = z.object({
  address: solanaAddressSchema,
})
