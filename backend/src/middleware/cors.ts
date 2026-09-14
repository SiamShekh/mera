import type { ErrorRequestHandler, RequestHandler } from 'express'

import { env } from '../config/env'
import { AppError } from '../errors'

export function corsMiddleware(): RequestHandler {
  const allowed = env()
    .CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  return (req, res, next) => {
    const origin = req.headers.origin
    if (origin && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      )
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      )
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
