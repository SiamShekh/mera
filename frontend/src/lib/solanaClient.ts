import { createClient } from '@solana/kit'
import { solanaRpc } from '@solana/kit-plugin-rpc'
import { walletSigner } from '@solana/kit-plugin-wallet'

import { SOLANA_CHAIN, SOLANA_RPC_URL } from '@/lib/config'

/**
 * One Solana Kit client for Mainnet.
 * - walletSigner: browser wallets (Phantom, etc.) via Wallet Standard
 * - solanaRpc: Mainnet RPC + sendTransaction helpers
 *
 * Docs: https://solana.com/docs/frontend/react-hooks
 */
export const solanaClient = createClient()
  .use(walletSigner({ chain: SOLANA_CHAIN }))
  .use(solanaRpc({ rpcUrl: SOLANA_RPC_URL }))

export type AppClient = typeof solanaClient
