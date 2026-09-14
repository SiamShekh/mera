import { Hono } from 'hono'

import type { AppEnv } from '../types/env'
import { ai } from './ai'
import { health } from './health'
import { keeper } from './keeper'
import { prices } from './prices'
import { rules } from './rules'
import { swap } from './swap'
import { users } from './users'

const routes = new Hono<AppEnv>()

routes.route('/health', health)
routes.route('/users', users)
routes.route('/rules', rules)
routes.route('/ai', ai)
routes.route('/keeper', keeper)
routes.route('/swap', swap)
routes.route('/prices', prices)

export { routes }
