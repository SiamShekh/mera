/**
 * One-shot Devnet check: can the swap authority mint 5,000 mock USDC?
 * Run from backend/: npx tsx scripts/debug-faucet.ts
 */
import {
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { Keypair, PublicKey } from '@solana/web3.js'

import { env } from '../src/config/env'
import {
  FAUCET_USDC_AMOUNT,
  faucetMockTokens,
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
} from '../src/solana/mockSwap'

async function main() {
  const config = env()
  const connection = getConnection(config)
  const authority = loadSwapAuthority(config)
  const tokens = listConfiguredSwapTokens(config)
  const usdc = tokens.find((token) => token.symbol === 'USDC')
  if (!usdc) {
    throw new Error('MOCK_USDC_MINT is not set')
  }

  const mint = new PublicKey(usdc.mint)
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_PROGRAM_ID)
  const authoritySol = await connection.getBalance(authority.publicKey)

  console.log(
    JSON.stringify(
      {
        usdcMint: usdc.mint,
        authority: authority.publicKey.toBase58(),
        mintAuthority: mintInfo.mintAuthority?.toBase58() ?? null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() ?? null,
        decimals: mintInfo.decimals,
        supply: mintInfo.supply.toString(),
        authoritySol,
        authorityIsMint:
          mintInfo.mintAuthority?.toBase58() === authority.publicKey.toBase58(),
      },
      null,
      2,
    ),
  )

  if (mintInfo.mintAuthority?.toBase58() !== authority.publicKey.toBase58()) {
    throw new Error(
      'Swap authority is not the USDC mint authority — faucet cannot mint.',
    )
  }
  if (authoritySol < 20_000_000) {
    throw new Error(
      `Swap authority only has ${authoritySol} lamports — faucet cannot pay fees.`,
    )
  }

  const user = Keypair.generate().publicKey
  const beforeAta = getAssociatedTokenAddressSync(
    mint,
    user,
    false,
    TOKEN_PROGRAM_ID,
  )
  console.log(
    JSON.stringify(
      { testWallet: user.toBase58(), ata: beforeAta.toBase58() },
      null,
      2,
    ),
  )

  const signature = await faucetMockTokens({
    connection,
    authority,
    userAddress: user.toBase58(),
    tokens,
  })

  const account = await getAccount(
    connection,
    beforeAta,
    'confirmed',
    TOKEN_PROGRAM_ID,
  )
  const uiAmount = Number(account.amount) / 10 ** mintInfo.decimals

  console.log(
    JSON.stringify(
      {
        signature,
        uiAmount,
        expected: FAUCET_USDC_AMOUNT,
        ok: uiAmount === FAUCET_USDC_AMOUNT,
      },
      null,
      2,
    ),
  )

  if (uiAmount !== FAUCET_USDC_AMOUNT) {
    throw new Error(
      `Expected ${FAUCET_USDC_AMOUNT} USDC, got ${uiAmount}`,
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
