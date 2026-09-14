import express from 'express'

import { corsMiddleware, errorHandler } from './middleware/cors'
import { routes } from './routes'

export function createApp() {
  const app = express()
  app.use(corsMiddleware())
  app.use(express.json({ limit: '2mb' }))
  app.use(routes)
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(errorHandler)
  return app
}

export type App = ReturnType<typeof createApp>
