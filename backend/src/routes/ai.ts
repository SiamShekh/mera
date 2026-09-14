import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { aiController } from '../controllers/ai.controller'
import { createDb } from '../db'
import type { AppEnv } from '../types/env'
import { chatBodySchema } from '../validators/chat'
import {
  compilePromptBodySchema,
  confirmRuleBodySchema,
  validateCompiledBodySchema,
} from '../validators/compile'

const ai = new Hono<AppEnv>()

/** 7.02 — Compile natural language into a strict rule preview (not saved yet). */
ai.post('/compile', zValidator('json', compilePromptBodySchema), async (c) => {
  const result = await aiController.compile(c.env, c.req.valid('json'))
  return c.json(result, result.ok ? 200 : 422)
})

/** In-app Mera AI chat (product-scoped conversational assistant). */
ai.post('/chat', zValidator('json', chatBodySchema), async (c) => {
  const result = await aiController.chat(c.env, c.req.valid('json'))
  return c.json(result)
})

/** 7.11 — Re-validate an edited draft rule + refresh interpretation/preview. */
ai.post(
  '/validate',
  zValidator('json', validateCompiledBodySchema),
  async (c) => {
    const result = aiController.validateEdit(c.req.valid('json'))
    return c.json(result, result.ok ? 200 : 422)
  },
)

/** 7.12–7.13 — Confirm and save the compiled rule. */
ai.post('/confirm', zValidator('json', confirmRuleBodySchema), async (c) => {
  const db = createDb(c.env.DB)
  const saved = await aiController.confirm(db, c.req.valid('json'))
  return c.json(saved, 201)
})

export { ai }
