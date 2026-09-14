import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

import { swapController } from '../controllers/swap.controller'
import { createDb } from '../db'
import type { AppEnv } from '../types/env'
import {
  swapCompleteBodySchema,
  swapFaucetBodySchema,
} from '../validators/swap'

const swap = new Hono<AppEnv>()

/** Devnet mock swap config (treasury + tradeable mints). */
swap.get('/config', async (c) => {
  const db = createDb(c.env.DB)
  return c.json(await swapController.config(c.env, db))
})

/** Quote using live mock prices. */
swap.post(
  '/quote',
  zValidator(
    'json',
    z.object({
      sellMint: z.string().min(32).max(64),
      buyMint: z.string().min(32).max(64),
      sellAmount: z.number().positive().max(1_000_000_000),
    }),
  ),
  async (c) => {
    const db = createDb(c.env.DB)
    return c.json(await swapController.quote(c.env, db, c.req.valid('json')))
  },
)

/**
 * After the user deposits sell tokens to the treasury, mint/transfer buy tokens.
 */
swap.post(
  '/complete',
  zValidator('json', swapCompleteBodySchema),
  async (c) => {
    const db = createDb(c.env.DB)
    const result = await swapController.complete(c.env, db, c.req.valid('json'))
    return c.json(result)
  },
)

/** Mint a starter bag of mock tokens to the connected wallet. */
swap.post('/faucet', zValidator('json', swapFaucetBodySchema), async (c) => {
  const result = await swapController.faucet(c.env, c.req.valid('json'))
  return c.json(result)
})

export { swap }
