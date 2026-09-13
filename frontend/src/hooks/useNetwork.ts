import { useContext } from 'react'

import { NetworkContext } from '@/components/wallet/networkContext'

/** Read the current network from NetworkProvider */
export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    throw new Error('useNetwork must be used inside NetworkProvider')
  }
  return ctx
}
