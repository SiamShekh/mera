import { Router } from 'express'

import { env } from '../config/env'
import { keeperController } from '../controllers/keeper.controller'
import { zodValidate } from '../middleware/zodValidate'
import {
  armAutopilotBodySchema,
  keeperTickBodySchema,
  linkPortfolioBodySchema,
  linkRuleBodySchema,
} from '../validators/keeper'
import type {
  ArmAutopilotBody,
  KeeperTickBody,
  LinkPortfolioBody,
  LinkRuleBody,
} from '../validators/keeper'

export const keeperRouter = Router()

keeperRouter.post(
  '/tick',
  zodValidate('body', keeperTickBodySchema),
  async (req, res, next) => {
    try {
      const result = await keeperController.tick(
        env(),
        req.validated!.body as KeeperTickBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

keeperRouter.post(
  '/arm',
  zodValidate('body', armAutopilotBodySchema),
  async (req, res, next) => {
    try {
      const result = await keeperController.armAutopilot(
        env(),
        req.validated!.body as ArmAutopilotBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

keeperRouter.post(
  '/portfolio',
  zodValidate('body', linkPortfolioBodySchema),
  async (req, res, next) => {
    try {
      const result = await keeperController.linkPortfolio(
        req.validated!.body as LinkPortfolioBody,
      )
      res.json(result)
    } catch (error) {
      next(error)
    }
  },
)

keeperRouter.post(
  '/link-rule',
  zodValidate('body', linkRuleBodySchema),
  async (req, res, next) => {
    try {
      const rule = await keeperController.linkRule(
        req.validated!.body as LinkRuleBody,
      )
      res.json({ rule })
    } catch (error) {
      next(error)
    }
  },
)
