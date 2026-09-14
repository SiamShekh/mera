import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { keeperController } from '../controllers/keeper.controller'
import { createDb } from '../db'
import type { AppEnv } from '../types/env'
import {
  keeperTickBodySchema,
  linkPortfolioBodySchema,
  linkRuleBodySchema,
} from '../validators/keeper'

const keeper = new Hono<AppEnv>()

keeper.post('/tick', zValidator('json', keeperTickBodySchema), async (c) => {
  const db = createDb(c.env.DB)
  const result = await keeperController.tick(db, c.env, c.req.valid('json'))
  return c.json(result)
})

keeper.post(
  '/portfolio',
  zValidator('json', linkPortfolioBodySchema),
  async (c) => {
    const db = createDb(c.env.DB)
    const result = await keeperController.linkPortfolio(db, c.req.valid('json'))
    return c.json(result)
  },
)

keeper.post('/link-rule', zValidator('json', linkRuleBodySchema), async (c) => {
  const db = createDb(c.env.DB)
  const rule = await keeperController.linkRule(db, c.req.valid('json'))
  return c.json({ rule })
})

export { keeper }
