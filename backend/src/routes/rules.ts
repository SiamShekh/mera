import { Router } from 'express'

import { env } from '../config/env'
import { rulesController } from '../controllers/rules.controller'
import { zodValidate } from '../middleware/zodValidate'
import {
  cancelRuleBodySchema,
  createRuleBodySchema,
  listRulesQuerySchema,
  ruleIdParamSchema,
  updateRuleBodySchema,
} from '../validators/rule'
import type {
  CancelRuleBody,
  CreateRuleBody,
  ListRulesQuery,
  UpdateRuleBody,
} from '../validators/rule'

export const rulesRouter = Router()

rulesRouter.post(
  '/',
  zodValidate('body', createRuleBodySchema),
  async (req, res, next) => {
    try {
      const rule = await rulesController.create(
        req.validated!.body as CreateRuleBody,
      )
      res.status(201).json({ rule })
    } catch (error) {
      next(error)
    }
  },
)

rulesRouter.get(
  '/',
  zodValidate('query', listRulesQuerySchema),
  async (req, res, next) => {
    try {
      const rows = await rulesController.list(
        req.validated!.query as ListRulesQuery,
      )
      res.json({ rules: rows })
    } catch (error) {
      next(error)
    }
  },
)

rulesRouter.get(
  '/:id',
  zodValidate('params', ruleIdParamSchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const rule = await rulesController.getById(id)
      res.json({ rule })
    } catch (error) {
      next(error)
    }
  },
)

rulesRouter.patch(
  '/:id',
  zodValidate('params', ruleIdParamSchema),
  zodValidate('body', updateRuleBodySchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const rule = await rulesController.update(
        id,
        req.validated!.body as UpdateRuleBody,
      )
      res.json({ rule })
    } catch (error) {
      next(error)
    }
  },
)

rulesRouter.post(
  '/:id/cancel',
  zodValidate('params', ruleIdParamSchema),
  zodValidate('body', cancelRuleBodySchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const { userAddress } = req.validated!.body as CancelRuleBody
      const result = await rulesController.cancel(env(), id, userAddress)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

rulesRouter.delete(
  '/:id',
  zodValidate('params', ruleIdParamSchema),
  async (req, res, next) => {
    try {
      const { id } = req.validated!.params as { id: string }
      const result = await rulesController.remove(id)
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)
