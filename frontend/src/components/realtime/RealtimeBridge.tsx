import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'

import { SOCKET_URL } from '@/lib/config'
import { requestPortfolioRefresh } from '@/lib/portfolioRefresh'
import { api } from '@/store/api'
import { useAppDispatch } from '@/store/hooks'
import type { KeeperTickResponse, PriceBook } from '@/types/api'

/**
 * Single Socket.io connection for live prices + Autopilot keeper ticks.
 * Updates the RTK Query price cache so market/ticker/swap stay fresh
 * without REST polling.
 */
export function RealtimeBridge() {
  const dispatch = useAppDispatch()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.debug('[realtime] connected', socket.id)
    })

    socket.on('prices', (book: PriceBook) => {
      dispatch(api.util.upsertQueryData('getPrices', undefined, book))
    })

    socket.on('keeper', (result: KeeperTickResponse) => {
      const filled = (result.executions ?? []).some(
        (row) => Boolean(row.txid) || row.soldAmount > 0 || row.buyAmount > 0,
      )
      if (filled || (result.executions?.length ?? 0) > 0) {
        dispatch(api.util.invalidateTags(['Rules']))
        requestPortfolioRefresh()
      }
    })

    socket.on('connect_error', (error) => {
      console.warn('[realtime] connect error', error.message)
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [dispatch])

  return null
}
