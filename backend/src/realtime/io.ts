import type { Server as HttpServer } from 'node:http'

import { Server } from 'socket.io'

import { env } from '../config/env'
import { keeperController } from '../controllers/keeper.controller'
import { ensureFresh } from '../solana/priceEngine'
import type { PriceBook } from '../solana/priceEngine'
import type { KeeperTickResult } from '../controllers/keeper.controller'

let io: Server | null = null
let lastBook: PriceBook | null = null
let cycling = false

export function getIO(): Server | null {
  return io
}

export function attachRealtime(httpServer: HttpServer): Server {
  const config = env()
  const origins = config.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  io = new Server(httpServer, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    console.log(`[realtime] connected ${socket.id}`)
    if (lastBook) {
      socket.emit('prices', lastBook)
    }
    socket.on('disconnect', () => {
      console.log(`[realtime] disconnected ${socket.id}`)
    })
  })

  void cycle()
  setInterval(() => {
    void cycle()
  }, config.REALTIME_TICK_MS)

  return io
}

async function cycle() {
  if (cycling || !io) return
  cycling = true
  const config = env()
  try {
    const book = await ensureFresh(config)
    lastBook = book
    io.emit('prices', book)

    const keeper: KeeperTickResult = await keeperController.tick(config, {
      dryRun: false,
    })
    io.emit('keeper', keeper)
  } catch (error) {
    console.error('[realtime] tick failed:', error)
  } finally {
    cycling = false
  }
}
