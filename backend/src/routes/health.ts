import { Hono } from 'hono'

import type { AppEnv } from '../types/env'

const health = new Hono<AppEnv>()

health.get('/', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 AS ok').first<{
      ok: number
    }>()

    if (!result || result.ok !== 1) {
      return c.json(
        {
          status: 'degraded',
          database: 'unreachable',
          environment: c.env.ENVIRONMENT,
        },
        503,
      )
    }

    return c.json({
      status: 'ok',
      database: 'connected',
      environment: c.env.ENVIRONMENT,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    return c.json(
      {
        status: 'degraded',
        database: 'error',
        message,
        environment: c.env.ENVIRONMENT,
      },
      503,
    )
  }
})

export { health }
