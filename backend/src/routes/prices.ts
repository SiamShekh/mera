import { Router } from 'express'

import { env } from '../config/env'
import { ensureFresh, getPriceBook, stepAll } from '../solana/priceEngine'

export const pricesRouter = Router()

pricesRouter.get('/', async (_req, res, next) => {
  try {
    const book = await ensureFresh(env())
    res.json(book)
  } catch (error) {
    next(error)
  }
})

pricesRouter.post('/tick', async (_req, res, next) => {
  try {
    const book = await stepAll(env())
    res.json(book)
  } catch (error) {
    next(error)
  }
})

pricesRouter.get('/snapshot', async (_req, res, next) => {
  try {
    const book = await getPriceBook()
    res.json(book)
  } catch (error) {
    next(error)
  }
})
