import { Router } from 'express'
import { z } from 'zod'

import { env } from '../config/env'
import { swapController } from '../controllers/swap.controller'
import { zodValidate } from '../middleware/zodValidate'
import {
  swapCompleteBodySchema,
  swapFaucetBodySchema,
} from '../validators/swap'
import type { SwapCompleteBody, SwapFaucetBody } from '../validators/swap'

export const swapRouter = Router()

swapRouter.get('/config', async (_req, res, next) => {
  try {
    res.json(await swapController.config(env()))
  } catch (error) {
    next(error)
  }
})

swapRouter.post(
  '/quote',
  zodValidate(
    'body',
    z.object({
      sellMint: z.string().min(32).max(64),
      buyMint: z.string().min(32).max(64),
      sellAmount: z.number().positive().max(1_000_000_000),
    }),
  ),
  async (req, res, next) => {
    try {
      res.json(
        await swapController.quote(
          env(),
          req.validated!.body as {
            sellMint: string
            buyMint: string
            sellAmount: number
          },
        ),
      )
    } catch (error) {
      next(error)
    }
  },
)

swapRouter.post(
  '/complete',
  zodValidate('body', swapCompleteBodySchema),
  async (req, res, next) => {
    try {
      const result = await swapController.complete(
        env(),
        req.validated!.body as SwapCompleteBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

swapRouter.post(
  '/faucet',
  zodValidate('body', swapFaucetBodySchema),
  async (req, res, next) => {
    try {
      const result = await swapController.faucet(
        env(),
        req.validated!.body as SwapFaucetBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)
