import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { Db } from '../db'
import { schema } from '../db'
import type {
  CreateRuleBody,
  ListRulesQuery,
  UpdateRuleBody,
} from '../validators/rule'

/**
 * Rules feature controller — owns create/list/get/update/delete against D1.
 * Routes stay thin: validate → controller → JSON response.
 */
export const rulesController = {
  async create(db: Db, body: CreateRuleBody) {
    const user = await db.query.users.findFirst({
      where: (fields, { eq: eqFn }) => eqFn(fields.address, body.userAddress),
    })

    if (!user) {
      throw new HTTPException(404, {
        message: 'User not found. Connect a wallet first.',
      })
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.insert(schema.rules).values({
      id,
      userAddress: body.userAddress,
      prompt: body.prompt ?? null,
      type: body.type,
      asset: body.asset,
      unit: body.unit,
      value: body.value,
      actionUnit: body.type === 'take_profit' ? body.actionUnit : null,
      actionValue: body.type === 'take_profit' ? body.actionValue : null,
      sellBasis: body.type === 'take_profit' ? body.sellBasis : null,
      status: body.status,
      createdAt: now,
      updatedAt: now,
    })

    return this.getById(db, id)
  },

  async list(db: Db, { userAddress, status }: ListRulesQuery) {
    return db.query.rules.findMany({
      where: (fields, { eq: eqFn, and: andFn }) =>
        status
          ? andFn(
              eqFn(fields.userAddress, userAddress),
              eqFn(fields.status, status),
            )
          : eqFn(fields.userAddress, userAddress),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    })
  },

  async getById(db: Db, id: string) {
    const rule = await db.query.rules.findFirst({
      where: (fields, { eq: eqFn }) => eqFn(fields.id, id),
    })

    if (!rule) {
      throw new HTTPException(404, { message: 'Rule not found' })
    }

    return rule
  },

  async update(db: Db, id: string, body: UpdateRuleBody) {
    await this.getById(db, id)

    await db
      .update(schema.rules)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.prompt !== undefined ? { prompt: body.prompt } : {}),
        ...(body.asset !== undefined ? { asset: body.asset } : {}),
        ...(body.unit !== undefined ? { unit: body.unit } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.actionUnit !== undefined
          ? { actionUnit: body.actionUnit }
          : {}),
        ...(body.actionValue !== undefined
          ? { actionValue: body.actionValue }
          : {}),
        ...(body.sellBasis !== undefined ? { sellBasis: body.sellBasis } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.rules.id, id))

    return this.getById(db, id)
  },

  async remove(db: Db, id: string) {
    await this.getById(db, id)
    await db.delete(schema.rules).where(eq(schema.rules.id, id))
    return { ok: true as const }
  },
}
