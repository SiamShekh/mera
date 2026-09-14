import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { rulesController } from '../controllers/rules.controller'
import { createDb } from '../db'
import type { AppEnv } from '../types/env'
import {
  createRuleBodySchema,
  listRulesQuerySchema,
  ruleIdParamSchema,
  updateRuleBodySchema,
} from '../validators/rule'

const rules = new Hono<AppEnv>()

rules.post('/', zValidator('json', createRuleBodySchema), async (c) => {
  const db = createDb(c.env.DB)
  const rule = await rulesController.create(db, c.req.valid('json'))
  return c.json({ rule }, 201)
})

rules.get('/', zValidator('query', listRulesQuerySchema), async (c) => {
  const db = createDb(c.env.DB)
  const rows = await rulesController.list(db, c.req.valid('query'))
  return c.json({ rules: rows })
})

rules.get('/:id', zValidator('param', ruleIdParamSchema), async (c) => {
  const db = createDb(c.env.DB)
  const rule = await rulesController.getById(db, c.req.valid('param').id)
  return c.json({ rule })
})

rules.patch(
  '/:id',
  zValidator('param', ruleIdParamSchema),
  zValidator('json', updateRuleBodySchema),
  async (c) => {
    const db = createDb(c.env.DB)
    const rule = await rulesController.update(
      db,
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json({ rule })
  },
)

rules.delete('/:id', zValidator('param', ruleIdParamSchema), async (c) => {
  const db = createDb(c.env.DB)
  const result = await rulesController.remove(db, c.req.valid('param').id)
  return c.json(result)
})

export { rules }
