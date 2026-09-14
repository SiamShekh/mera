import { Schema, model, type InferSchemaType } from 'mongoose'

const RULE_TYPES = [
  'max_allocation',
  'min_allocation',
  'take_profit',
  'stop_loss',
  'market_buy',
  'limit_buy',
] as const

const ruleSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userAddress: { type: String, required: true, index: true },
    prompt: { type: String, default: null },
    type: { type: String, enum: RULE_TYPES, required: true, index: true },
    asset: { type: String, required: true },
    unit: { type: String, enum: ['percent', 'amount'], required: true },
    value: { type: Number, required: true },
    actionUnit: {
      type: String,
      enum: ['percent', 'amount'],
      default: null,
    },
    actionValue: { type: Number, default: null },
    sellBasis: {
      type: String,
      enum: ['position', 'portfolio'],
      default: null,
    },
    payAsset: { type: String, default: null },
    limitPrice: { type: Number, default: null },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      required: true,
      default: 'active',
      index: true,
    },
    mint: { type: String, default: null },
    portfolioPda: { type: String, default: null, index: true },
    onChainRulePda: { type: String, default: null },
    onChainRuleId: { type: Number, default: null },
    onChainStatus: {
      type: String,
      enum: ['pending', 'active', 'paused', 'failed'],
      default: null,
      index: true,
    },
    escrowSellAmount: { type: Number, default: null },
    escrowDepositSig: { type: String, default: null },
    executedAt: { type: String, default: null },
    executionTxid: { type: String, default: null },
    executionNote: { type: String, default: null },
    createdAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    updatedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

ruleSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type RuleDoc = InferSchemaType<typeof ruleSchema>
export type RuleType = (typeof RULE_TYPES)[number]
export type RuleUnit = 'percent' | 'amount'

/** API / domain rule shape (nullable fields are `null`, never undefined). */
export type Rule = {
  id: string
  userAddress: string
  prompt: string | null
  type: RuleType
  asset: string
  unit: RuleUnit
  value: number
  actionUnit: RuleUnit | null
  actionValue: number | null
  sellBasis: 'position' | 'portfolio' | null
  payAsset: string | null
  limitPrice: number | null
  status: 'draft' | 'active' | 'paused'
  mint: string | null
  portfolioPda: string | null
  onChainRulePda: string | null
  onChainRuleId: number | null
  onChainStatus: 'pending' | 'active' | 'paused' | 'failed' | null
  escrowSellAmount: number | null
  escrowDepositSig: string | null
  executedAt: string | null
  executionTxid: string | null
  executionNote: string | null
  createdAt: string
  updatedAt: string
}

export const RuleModel = model('Rule', ruleSchema, 'rules')
