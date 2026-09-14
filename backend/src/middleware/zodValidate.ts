import type { RequestHandler } from 'express'
import type { ZodType } from 'zod'

import { AppError } from '../errors'

type Source = 'body' | 'query' | 'params'

/** Parse req[source] with Zod and attach as `req.validated[source]`. */
export function zodValidate<T>(
  source: Source,
  schema: ZodType<T>,
): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source])
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => issue.message)
        .join('; ')
      next(new AppError(400, message || 'Invalid request'))
      return
    }
    const bag = (req.validated ??= {})
    bag[source] = parsed.data
    next()
  }
}

declare global {
  namespace Express {
    interface Request {
      validated?: {
        body?: unknown
        query?: unknown
        params?: unknown
      }
    }
  }
}
