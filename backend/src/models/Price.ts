import { Schema, model, type InferSchemaType } from 'mongoose'

const mockPriceSchema = new Schema(
  {
    mint: { type: String, required: true, unique: true },
    symbol: { type: String, required: true },
    priceUsd: { type: Number, required: true },
    anchorUsd: { type: Number, required: true },
    updatedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

mockPriceSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type MockPriceDoc = InferSchemaType<typeof mockPriceSchema>
export const MockPrice = model('MockPrice', mockPriceSchema, 'mock_prices')

const priceTickSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    mint: { type: String, required: true },
    priceUsd: { type: Number, required: true },
    changePct: { type: Number, required: true },
    createdAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

priceTickSchema.index({ mint: 1, createdAt: -1 })

priceTickSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type PriceTickDoc = InferSchemaType<typeof priceTickSchema>
export const PriceTick = model('PriceTick', priceTickSchema, 'price_ticks')
