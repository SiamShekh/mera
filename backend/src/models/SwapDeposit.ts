import { Schema, model, type InferSchemaType } from 'mongoose'

const swapDepositSchema = new Schema(
  {
    signature: { type: String, required: true, unique: true },
    userAddress: { type: String, required: true },
    sellMint: { type: String, required: true },
    buyMint: { type: String, required: true },
    sellAmount: { type: String, required: true },
    buyAmount: { type: String, required: true },
    payoutSignature: { type: String, default: null },
    createdAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

swapDepositSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type SwapDepositDoc = InferSchemaType<typeof swapDepositSchema>
export const SwapDeposit = model(
  'SwapDeposit',
  swapDepositSchema,
  'swap_deposits',
)
