import { AppError } from '../errors'
import { ChatMessage, ChatThread, User } from '../models'
import type {
  AppendChatMessageBody,
  CreateChatThreadBody,
  ListChatThreadsQuery,
} from '../validators/chatHistory'

async function ensureUser(address: string) {
  await User.updateOne(
    { address },
    { $setOnInsert: { address, createdAt: new Date().toISOString() } },
    { upsert: true },
  )
}

async function getOwnedThread(threadId: string, userAddress: string) {
  const thread = await ChatThread.findOne({ id: threadId, userAddress })
  if (!thread) {
    throw new AppError(404, 'Chat thread not found')
  }
  return thread
}

export const chatController = {
  async listThreads({ userAddress }: ListChatThreadsQuery) {
    const threads = await ChatThread.find({ userAddress }).sort({
      updatedAt: -1,
    })

    const withPreview = await Promise.all(
      threads.map(async (thread) => {
        const last = await ChatMessage.findOne({ threadId: thread.id }).sort({
          createdAt: -1,
        })
        return {
          id: thread.id,
          title: thread.title,
          updatedAt: thread.updatedAt,
          createdAt: thread.createdAt,
          preview: last?.content ?? null,
        }
      }),
    )

    return { threads: withPreview }
  },

  async getThread(threadId: string, userAddress: string) {
    const thread = await getOwnedThread(threadId, userAddress)
    const messages = await ChatMessage.find({ threadId }).sort({
      createdAt: 1,
    })
    return {
      thread: {
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        createdAt: thread.createdAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      },
    }
  },

  async createThread(body: CreateChatThreadBody) {
    await ensureUser(body.userAddress)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await ChatThread.create({
      id,
      userAddress: body.userAddress,
      title: body.title ?? 'New chat',
      createdAt: now,
      updatedAt: now,
    })
    return {
      thread: {
        id,
        title: body.title ?? 'New chat',
        updatedAt: now,
        createdAt: now,
        messages: [] as Array<{
          id: string
          role: 'user' | 'assistant'
          content: string
          createdAt: string
        }>,
      },
    }
  },

  async appendMessage(threadId: string, body: AppendChatMessageBody) {
    await getOwnedThread(threadId, body.userAddress)
    const id = body.id ?? crypto.randomUUID()
    const now = new Date().toISOString()

    await ChatMessage.create({
      id,
      threadId,
      role: body.role,
      content: body.content,
      createdAt: now,
    })

    const titleUpdate =
      body.title && body.title.trim()
        ? { title: body.title.trim(), updatedAt: now }
        : { updatedAt: now }

    await ChatThread.updateOne(
      { id: threadId, userAddress: body.userAddress },
      { $set: titleUpdate },
    )

    const thread = await getOwnedThread(threadId, body.userAddress)
    return {
      message: {
        id,
        role: body.role,
        content: body.content,
        createdAt: now,
      },
      thread: {
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        createdAt: thread.createdAt,
      },
    }
  },

  async deleteThread(threadId: string, userAddress: string) {
    await getOwnedThread(threadId, userAddress)
    await ChatMessage.deleteMany({ threadId })
    await ChatThread.deleteOne({ id: threadId, userAddress })
    return { ok: true as const }
  },
}
