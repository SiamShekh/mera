import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'

import type { AppEnv } from '../types/env'

/** CORS for the Vite frontend; origins come from `CORS_ORIGIN` (comma-separated). */
export const corsMiddleware: MiddlewareHandler<AppEnv> = (c, next) => {
  const allowed = c.env.CORS_ORIGIN?.split(',')
    .map((o: string) => o.trim())
    .filter(Boolean) ?? ['http://localhost:5173', 'http://127.0.0.1:5173']

  return cors({
    origin: allowed,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })(c, next)
}
