import { Router } from 'express'

import { env } from '../config/env'
import { isMongoReady } from '../db/connect'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  if (!isMongoReady()) {
    res.status(503).json({
      status: 'degraded',
      database: 'unreachable',
      environment: env().ENVIRONMENT,
    })
    return
  }

  res.json({
    status: 'ok',
    database: 'connected',
    environment: env().ENVIRONMENT,
  })
})
