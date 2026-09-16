import { AppError } from '../errors'
import { leanRequired } from '../models/lean'
import { RuleModel, User, type Rule } from '../models'
import {
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
  payoutBuyTokens,
} from '../solana/mockSwap'
import { getPriceMap } from '../solana/priceEngine'
import type { Bindings } from '../types/env'
import type {
  CreateRuleBody,
  ListRulesQuery,
  UpdateRuleBody,
} from '../validators/rule'

export type CancelRuleResult = {
  ok: true
  ruleId: string
  refunded: boolean
  refundedAmount: number | null
  refundMint: string | null
  refundSymbol: string | null
  refundSignature: string | null
}

/**
 * Rules feature controller — create/list/get/update/delete against Mongo.
 */
export const rulesController = {
  async create(body: CreateRuleBody): Promise<Rule> {
    const user = await User.findOne({ address: body.userAddress }).lean()
    if (!user) {
      throw new AppError(404, 'User not found. Connect a wallet first.')
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await RuleModel.create({
      id,
      userAddress: body.userAddress,
      prompt: body.prompt ?? null,
      type: body.type,
      asset: body.asset,
      unit: body.unit,
      value: body.value,
      actionUnit:
        body.type === 'take_profit' || body.type === 'stop_loss'
          ? body.actionUnit
          : null,
      actionValue:
        body.type === 'take_profit' || body.type === 'stop_loss'
          ? body.actionValue
          : null,
      sellBasis:
        body.type === 'take_profit' || body.type === 'stop_loss'
          ? body.sellBasis
          : null,
      payAsset:
        body.type === 'market_buy' || body.type === 'limit_buy'
          ? body.payAsset
          : null,
      limitPrice:
        body.type === 'limit_buy'
          ? (body.limitPrice ?? null)
          : body.type === 'market_buy'
            ? null
            : null,
      status: body.status,
      createdAt: now,
      updatedAt: now,
    })

    return this.getById(id)
  },

  async list({ userAddress, status }: ListRulesQuery): Promise<Rule[]> {
    const filter: Record<string, unknown> = { userAddress }
    if (status) filter.status = status
    const rows = await RuleModel.find(filter).sort({ createdAt: -1 })
    return rows.map((row) => leanRequired<Rule>(row))
  },

  /** Unfilled rules — still live, including escrowed Autopilot orders. */
  async listOpen(userAddress: string): Promise<Rule[]> {
    const rows = await RuleModel.find({
      userAddress,
      executedAt: null,
    }).sort({ createdAt: -1 })
    return rows.map((row) => leanRequired<Rule>(row))
  },

  async getById(id: string): Promise<Rule> {
    const rule = await RuleModel.findOne({ id })
    if (!rule) {
      throw new AppError(404, 'Rule not found')
    }
    return leanRequired<Rule>(rule)
  },

  async update(id: string, body: UpdateRuleBody): Promise<Rule> {
    await this.getById(id)

    await RuleModel.updateOne(
      { id },
      {
        $set: {
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
          ...(body.sellBasis !== undefined
            ? { sellBasis: body.sellBasis }
            : {}),
          updatedAt: new Date().toISOString(),
        },
      },
    )

    return this.getById(id)
  },

  async remove(id: string) {
    await this.getById(id)
    await RuleModel.deleteOne({ id })
    return { ok: true as const }
  },

  /**
   * Cancel an unfilled rule and mint escrowed tokens back to the user's
   * spendable wallet (mock treasury keeps the original deposit).
   */
  async cancel(
    env: Bindings,
    id: string,
    userAddress: string,
  ): Promise<CancelRuleResult> {
    const rule = await this.getById(id)
    if (rule.userAddress !== userAddress) {
      throw new AppError(403, 'Rule belongs to another wallet')
    }
    if (rule.executedAt) {
      throw new AppError(
        409,
        'This order already filled — nothing left to cancel.',
      )
    }

    const now = new Date().toISOString()
    await RuleModel.updateOne(
      { id },
      { $set: { status: 'paused', updatedAt: now } },
    )

    let refundSignature: string | null = null
    let refundedAmount: number | null = null
    let refundMint: string | null = null
    let refundSymbol: string | null = null

    const amount = Number(rule.escrowSellAmount)
    const mint = rule.mint
    if (mint && Number.isFinite(amount) && amount > 0) {
      try {
        const priceMap = await getPriceMap(env)
        const tokens = listConfiguredSwapTokens(env, priceMap)
        const token = tokens.find((row) => row.mint === mint)
        const connection = getConnection(env)
        const authority = loadSwapAuthority(env)
        refundSignature = await payoutBuyTokens({
          connection,
          authority,
          userAddress,
          buyMint: mint,
          buyAmountUi: amount,
          decimals: token?.decimals ?? 6,
        })
        refundedAmount = amount
        refundMint = mint
        refundSymbol = token?.symbol ?? rule.payAsset ?? rule.asset
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Refund transfer failed'
        throw new AppError(
          502,
          `Couldn’t return locked tokens to your wallet (${message}). The order is paused — try Cancel again.`,
        )
      }
    }

    await RuleModel.deleteOne({ id })
    return {
      ok: true as const,
      ruleId: id,
      refunded: Boolean(refundSignature),
      refundedAmount,
      refundMint,
      refundSymbol,
      refundSignature,
    }
  },
}
