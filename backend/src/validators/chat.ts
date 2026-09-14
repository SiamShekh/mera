import { z } from 'zod'

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
})

export const chatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  /** Prior turns (oldest first), excluding the new user message. */
  history: z.array(chatMessageSchema).max(40).optional(),
  holdings: z.array(z.string().min(1).max(32)).max(40).optional(),
  walletConnected: z.boolean().optional(),
})

export type ChatBody = z.infer<typeof chatBodySchema>
