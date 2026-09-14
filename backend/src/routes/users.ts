import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { createDb, schema } from '../db'
import type { AppEnv } from '../types/env'
import {
  createUserBodySchema,
  userAddressParamSchema,
} from '../validators/user'

const users = new Hono<AppEnv>()

/** Upsert user when a Solana wallet connects. Body: { address } */
users.post('/', zValidator('json', createUserBodySchema), async (c) => {
  const { address } = c.req.valid('json')
  const db = createDb(c.env.DB)

  await db
    .insert(schema.users)
    .values({ address })
    .onConflictDoNothing({ target: schema.users.address })

  const user = await db.query.users.findFirst({
    where: (fields, { eq }) => eq(fields.address, address),
  })

  return c.json({ user }, 201)
})

users.get(
  '/:address',
  zValidator('param', userAddressParamSchema),
  async (c) => {
    const { address } = c.req.valid('param')
    const db = createDb(c.env.DB)

    const user = await db.query.users.findFirst({
      where: (fields, { eq }) => eq(fields.address, address),
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({ user })
  },
)

export { users }
