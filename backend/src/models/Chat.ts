import { Schema, model, type InferSchemaType } from 'mongoose'

const chatThreadSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    userAddress: { type: String, required: true },
    title: { type: String, required: true, default: 'New chat' },
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

chatThreadSchema.index({ userAddress: 1, updatedAt: -1 })

chatThreadSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type ChatThreadDoc = InferSchemaType<typeof chatThreadSchema>
export const ChatThread = model('ChatThread', chatThreadSchema, 'chat_threads')

const chatMessageSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    threadId: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    createdAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  { versionKey: false },
)

chatMessageSchema.index({ threadId: 1, createdAt: 1 })

chatMessageSchema.set('toJSON', {
  transform(_doc, ret) {
    Reflect.deleteProperty(ret, '_id')
    return ret
  },
})

export type ChatMessageDoc = InferSchemaType<typeof chatMessageSchema>
export const ChatMessage = model(
  'ChatMessage',
  chatMessageSchema,
  'chat_messages',
)
