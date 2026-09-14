import { Router } from 'express'

import { User } from '../models'
import { zodValidate } from '../middleware/zodValidate'
import {
  createUserBodySchema,
  userAddressParamSchema,
} from '../validators/user'

export const usersRouter = Router()

usersRouter.post(
  '/',
  zodValidate('body', createUserBodySchema),
  async (req, res, next) => {
    try {
      const { address } = req.validated!.body as { address: string }
      await User.updateOne(
        { address },
        { $setOnInsert: { address, createdAt: new Date().toISOString() } },
        { upsert: true },
      )
      const user = await User.findOne({ address }).lean()
      res.status(201).json({
        user: user
          ? { address: user.address, createdAt: user.createdAt }
          : { address, createdAt: new Date().toISOString() },
      })
    } catch (error) {
      next(error)
    }
  },
)

usersRouter.get(
  '/:address',
  zodValidate('params', userAddressParamSchema),
  async (req, res, next) => {
    try {
      const { address } = req.validated!.params as { address: string }
      const user = await User.findOne({ address }).lean()
      if (!user) {
        res.status(404).json({ error: 'User not found' })
        return
      }
      res.json({
        user: { address: user.address, createdAt: user.createdAt },
      })
    } catch (error) {
      next(error)
    }
  },
)
