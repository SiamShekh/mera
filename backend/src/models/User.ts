import { Schema, model, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    address: { type: String, required: true, unique: true },
    createdAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

userSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type UserDoc = InferSchemaType<typeof userSchema>
export const User = model('User', userSchema, 'users')
