import { Router } from 'express'

import { portfolioController } from '../controllers/portfolio.controller'
import { zodValidate } from '../middleware/zodValidate'
import {
  listLockedQuerySchema,
  type ListLockedQuery,
} from '../validators/portfolio'

export const portfolioRouter = Router()

portfolioRouter.get(
  '/locked',
  zodValidate('query', listLockedQuerySchema),
  async (req, res, next) => {
    try {
      const { userAddress } = req.validated!.query as ListLockedQuery
      res.json(await portfolioController.locked(userAddress))
    } catch (error) {
      next(error)
    }
  },
)
