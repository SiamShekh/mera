import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { corsMiddleware } from './middleware/cors'
import { routes } from './routes'
import type { AppEnv } from './types/env'

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', corsMiddleware)
  app.route('/', routes)

  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }

    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
