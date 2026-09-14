import { Hono } from 'hono'

import { createDb } from '../db'
import { ensureFresh, getPriceBook, stepAll } from '../solana/priceEngine'
import type { AppEnv } from '../types/env'

const prices = new Hono<AppEnv>()

/** Current mock book + recent ticks (auto-advances if stale). */
prices.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const book = await ensureFresh(db, c.env)
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
