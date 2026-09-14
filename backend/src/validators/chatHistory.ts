import { z } from 'zod'

import { solanaAddressSchema } from './user'

export const chatRoleSchema = z.enum(['user', 'assistant'])

export const listChatThreadsQuerySchema = z.object({
  userAddress: solanaAddressSchema,
})

export const chatThreadIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const createChatThreadBodySchema = z.object({
  userAddress: solanaAddressSchema,
  title: z.string().trim().min(1).max(120).optional(),
})

export const appendChatMessageBodySchema = z.object({
  userAddress: solanaAddressSchema,
  role: chatRoleSchema,
  content: z.string().trim().min(1).max(20_000),
  /** Optional client id; server generates one when omitted. */
  id: z.string().min(1).max(64).optional(),
  /** When set, renames the thread (typically from first user message). */
  title: z.string().trim().min(1).max(120).optional(),
})

export const deleteChatThreadQuerySchema = z.object({
  userAddress: solanaAddressSchema,
})

export type ListChatThreadsQuery = z.infer<typeof listChatThreadsQuerySchema>
export type CreateChatThreadBody = z.infer<typeof createChatThreadBodySchema>
export type AppendChatMessageBody = z.infer<typeof appendChatMessageBodySchema>
