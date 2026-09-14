import { createApp } from './app'
import { createDb } from './db'
import { keeperController } from './controllers/keeper.controller'
import { ensureFresh } from './solana/priceEngine'
import type { Bindings } from './types/env'

/**
 * Cloudflare Workers entry.
 * Local: `npm run dev` (Wrangler + local D1 SQLite)
 * Deploy: `npm run deploy`
 */
const app = createApp()

const worker = {
  fetch: app.fetch.bind(app),

  /** Advance mock prices + settle Autopilot sells every cron minute. */
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        const db = createDb(env.DB)
        await ensureFresh(db, env)
        await keeperController.tick(db, env, { dryRun: false })
      })(),
    )
  },
}

export default worker
