import { createServer } from 'node:http'

import { createApp } from './app'
import { env } from './config/env'
import { connectMongo } from './db/connect'
import { attachRealtime } from './realtime/io'

async function main() {
  const config = env()
  await connectMongo(config.MONGODB_URI)

  const app = createApp()
  const httpServer = createServer(app)
  attachRealtime(httpServer)

  httpServer.listen(config.PORT, () => {
    console.log(
      `[mera] Express + Socket.io on :${config.PORT} (${config.ENVIRONMENT})`,
    )
  })
}

main().catch((error) => {
  console.error('[mera] failed to start', error)
  process.exit(1)
})
