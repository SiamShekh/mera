import { Router } from 'express'

import { aiController } from '../controllers/ai.controller'
import { env } from '../config/env'
import { zodValidate } from '../middleware/zodValidate'
import { autopilotTurnBodySchema } from '../validators/autopilot'
import { chatBodySchema } from '../validators/chat'
import {
  compilePromptBodySchema,
  confirmRuleBodySchema,
  validateCompiledBodySchema,
} from '../validators/compile'
import type { AutopilotTurnBody } from '../validators/autopilot'
import type { ChatBody } from '../validators/chat'
import type {
  CompilePromptBody,
  ConfirmRuleBody,
  ValidateCompiledBody,
} from '../validators/compile'

export const aiRouter = Router()

aiRouter.post(
  '/compile',
  zodValidate('body', compilePromptBodySchema),
  async (req, res, next) => {
    try {
      const result = await aiController.compile(
        env(),
        req.validated!.body as CompilePromptBody,
      )
      res.status(result.ok ? 200 : 422).json(result)
    } catch (error) {
      next(error)
    }
  },
)

aiRouter.post(
  '/chat',
  zodValidate('body', chatBodySchema),
  async (req, res, next) => {
    try {
      const result = await aiController.chat(
        env(),
        req.validated!.body as ChatBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

aiRouter.post(
  '/autopilot',
  zodValidate('body', autopilotTurnBodySchema),
  async (req, res, next) => {
    try {
      const result = await aiController.autopilotTurn(
        env(),
        req.validated!.body as AutopilotTurnBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

aiRouter.post(
  '/validate',
  zodValidate('body', validateCompiledBodySchema),
  async (req, res, next) => {
    try {
      const result = aiController.validateEdit(
        req.validated!.body as ValidateCompiledBody,
      )
      res.status(result.ok ? 200 : 422).json(result)
    } catch (error) {
      next(error)
    }
  },
)

aiRouter.post(
  '/confirm',
  zodValidate('body', confirmRuleBodySchema),
  async (req, res, next) => {
    try {
      const saved = await aiController.confirm(
        req.validated!.body as ConfirmRuleBody,
      )
      res.status(201).json(saved)
    } catch (error) {
      next(error)
    }
  },
)
