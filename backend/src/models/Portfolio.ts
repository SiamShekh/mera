import { Schema, model, type InferSchemaType } from 'mongoose'

const portfolioSchema = new Schema(
  {
    userAddress: { type: String, required: true, unique: true },
    portfolioPda: { type: String, required: true, unique: true },
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

portfolioSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type PortfolioDoc = InferSchemaType<typeof portfolioSchema>
export const Portfolio = model('Portfolio', portfolioSchema, 'portfolios')
