import { createClient } from '@solana/kit'
import { solanaRpc } from '@solana/kit-plugin-rpc'
import { walletSigner } from '@solana/kit-plugin-wallet'

import { NETWORKS, type SolanaNetworkId } from '@/lib/config'

/**
 * Build a Kit client for Devnet or Mainnet.
 * Call again when the user flips the network switch.
 *
 * Docs: https://solana.com/docs/frontend/react-hooks
 */
export function createSolanaClient(network: SolanaNetworkId) {
  const config = NETWORKS[network]

  return createClient()
    .use(walletSigner({ chain: config.chain }))
    .use(solanaRpc({ rpcUrl: config.rpcUrl }))
}

export type AppClient = ReturnType<typeof createSolanaClient>
