/**
 * One Solana Kit client for Devnet.
 * - walletSigner: connects to Phantom / Solflare / etc. on Devnet
 * - solanaRpc: Devnet RPC + sendTransaction helpers
 */
import { createClient } from '@solana/kit'
import { solanaRpc } from '@solana/kit-plugin-rpc'
import { walletSigner } from '@solana/kit-plugin-wallet'

import { SOLANA_CHAIN, SOLANA_RPC_URL } from '@/lib/config'

export const solanaClient = createClient()
  .use(walletSigner({ chain: SOLANA_CHAIN }))
  .use(solanaRpc({ rpcUrl: SOLANA_RPC_URL }))

export type AppClient = typeof solanaClient
