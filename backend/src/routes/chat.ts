import { Router } from 'express'
import { z } from 'zod'

import { chatController } from '../controllers/chat.controller'
import { zodValidate } from '../middleware/zodValidate'
import {
  appendChatMessageBodySchema,
  chatThreadIdParamSchema,
  createChatThreadBodySchema,
  deleteChatThreadQuerySchema,
  listChatThreadsQuerySchema,
} from '../validators/chatHistory'
import type {
  AppendChatMessageBody,
  CreateChatThreadBody,
  ListChatThreadsQuery,
} from '../validators/chatHistory'

export const chatRouter = Router()

const getThreadQuerySchema = z.object({
  userAddress: listChatThreadsQuerySchema.shape.userAddress,
})

chatRouter.get(
  '/threads',
  zodValidate('query', listChatThreadsQuerySchema),
  async (req, res, next) => {
    try {
      const result = await chatController.listThreads(
        req.validated!.query as ListChatThreadsQuery,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

chatRouter.post(
  '/threads',
  zodValidate('body', createChatThreadBodySchema),
  async (req, res, next) => {
    try {
      const result = await chatController.createThread(
        req.validated!.body as CreateChatThreadBody,
      )
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  },
)

chatRouter.get(
  '/threads/:id',
  zodValidate('params', chatThreadIdParamSchema),
  zodValidate('query', getThreadQuerySchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const { userAddress } = req.validated!.query as { userAddress: string }
      const result = await chatController.getThread(id, userAddress)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

chatRouter.post(
  '/threads/:id/messages',
  zodValidate('params', chatThreadIdParamSchema),
  zodValidate('body', appendChatMessageBodySchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const result = await chatController.appendMessage(
        id,
        req.validated!.body as AppendChatMessageBody,
      )
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  },
)

chatRouter.delete(
  '/threads/:id',
  zodValidate('params', chatThreadIdParamSchema),
  zodValidate('query', deleteChatThreadQuerySchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const { userAddress } = req.validated!.query as { userAddress: string }
      const result = await chatController.deleteThread(id, userAddress)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)
