import { Router } from 'express'

import { aiRouter } from './ai'
import { chatRouter } from './chat'
import { healthRouter } from './health'
import { keeperRouter } from './keeper'
import { pricesRouter } from './prices'
import { rulesRouter } from './rules'
import { swapRouter } from './swap'
import { usersRouter } from './users'

export const routes = Router()

routes.use('/health', healthRouter)
routes.use('/users', usersRouter)
routes.use('/rules', rulesRouter)
routes.use('/ai', aiRouter)
routes.use('/chat', chatRouter)
routes.use('/keeper', keeperRouter)
routes.use('/swap', swapRouter)
routes.use('/prices', pricesRouter)
