import { Hono } from 'hono'

import { keeperController } from '../controllers/keeper.controller'
import { createDb } from '../db'
import { ensureFresh, getPriceBook, stepAll } from '../solana/priceEngine'
import type { AppEnv } from '../types/env'

const prices = new Hono<AppEnv>()

/** Throttle Autopilot settlement when clients poll /prices (local cron is flaky). */
let lastAutopilotMs = 0
const AUTOPILOT_MIN_INTERVAL_MS = 12_000

/** Current mock book + recent ticks (auto-advances if stale). */
prices.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const book = await ensureFresh(db, c.env)

  const now = Date.now()
  if (now - lastAutopilotMs >= AUTOPILOT_MIN_INTERVAL_MS) {
    lastAutopilotMs = now
    c.executionCtx.waitUntil(
      keeperController.tick(db, c.env, { dryRun: false }).catch(() => null),
    )
  }

  return c.json(book)
})

/** Force one simulation step (demo / cron helper). */
prices.post('/tick', async (c) => {
  const db = createDb(c.env.DB)
  const book = await stepAll(db, c.env)
  return c.json(book)
})

/** Snapshot without advancing (debug). */
prices.get('/snapshot', async (c) => {
  const db = createDb(c.env.DB)
  const book = await getPriceBook(db)
  return c.json(book)
})

export { prices }
