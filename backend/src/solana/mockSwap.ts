import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

import { XSTOCKS_CATALOG, XSTOCK_PRICES } from '../data/xstocks'
import type { Bindings } from '../types/env'

export type SwapToken = {
  symbol: string
  mint: string
  decimals: number
  priceUsd: number
}

const DEFAULT_DECIMALS = 6

/** Fixed Devnet mock prices (fallback when live book empty). */
export const MOCK_SWAP_PRICES: Record<string, number> = {
  USDC: 1,
  NVDAx: 120,
  SOLx: 150,
  stX: 165,
  ...XSTOCK_PRICES,
}

function resolveLivePrice(
  livePrices: Record<string, number> | undefined,
  symbol: string,
  mint?: string,
  fallback?: number,
): number {
  if (livePrices?.[symbol] != null) return livePrices[symbol]
  if (mint && livePrices?.[mint] != null) return livePrices[mint]
  return fallback ?? MOCK_SWAP_PRICES[symbol] ?? 100
}

export function listConfiguredSwapTokens(
  env: Bindings,
  livePrices?: Record<string, number>,
): SwapToken[] {
  const rows: Array<{ symbol: string; mint?: string; priceUsd: number }> = [
    {
      symbol: 'USDC',
      mint: env.MOCK_USDC_MINT,
      priceUsd: resolveLivePrice(
        livePrices,
        'USDC',
        env.MOCK_USDC_MINT,
        MOCK_SWAP_PRICES.USDC,
      ),
    },
    {
      symbol: 'NVDAx',
      mint: env.MOCK_NVDAX_MINT,
      priceUsd: resolveLivePrice(
        livePrices,
        'NVDAx',
        env.MOCK_NVDAX_MINT,
        MOCK_SWAP_PRICES.NVDAx,
      ),
    },
    {
      symbol: 'SOLx',
      mint: env.MOCK_SOLX_MINT,
      priceUsd: resolveLivePrice(
        livePrices,
        'SOLx',
        env.MOCK_SOLX_MINT,
        MOCK_SWAP_PRICES.SOLx,
      ),
    },
    {
      symbol: 'stX',
      mint: env.MOCK_STX_MINT,
      priceUsd: resolveLivePrice(
        livePrices,
        'stX',
        env.MOCK_STX_MINT,
        MOCK_SWAP_PRICES.stX,
      ),
    },
    ...XSTOCKS_CATALOG.map((stock) => ({
      symbol: stock.symbol,
      mint: stock.mint,
      priceUsd: resolveLivePrice(
        livePrices,
        stock.symbol,
        stock.mint,
        stock.priceUsd,
      ),
    })),
  ]

  return rows
    .filter((row) => row.mint && row.mint.length >= 32)
    .map((row) => ({
      symbol: row.symbol,
      mint: row.mint as string,
      decimals: DEFAULT_DECIMALS,
      priceUsd: row.priceUsd,
    }))
}

export function quoteSwap(options: {
  tokens: SwapToken[]
  sellMint: string
  buyMint: string
  sellAmount: number
}): { buyAmount: number; rate: number; sellUsd: number; buyUsd: number } {
  const sell = options.tokens.find((t) => t.mint === options.sellMint)
  const buy = options.tokens.find((t) => t.mint === options.buyMint)
  if (!sell || !buy) {
    throw new Error('Unknown sell or buy mint')
  }
  if (sell.mint === buy.mint) {
    throw new Error('Choose two different tokens')
  }
  if (!(options.sellAmount > 0) || !Number.isFinite(options.sellAmount)) {
    throw new Error('Enter a valid sell amount')
  }

  const sellUsd = options.sellAmount * sell.priceUsd
  const buyAmount = sellUsd / buy.priceUsd
  const rate = buy.priceUsd > 0 ? sell.priceUsd / buy.priceUsd : 0

  return {
    buyAmount: roundAmount(buyAmount, buy.decimals),
    rate,
    sellUsd,
    buyUsd: sellUsd,
  }
}

/**
 * Size the pay (sell) leg so a target share count can settle exactly.
 * Ceils pay amount to token decimals so floor-based payouts never undershoot.
 */
export function quoteSwapForBuyAmount(options: {
  tokens: SwapToken[]
  sellMint: string
  buyMint: string
  buyAmount: number
}): {
  sellAmount: number
  buyAmount: number
  rate: number
  sellUsd: number
  buyUsd: number
} {
  const sell = options.tokens.find((t) => t.mint === options.sellMint)
  const buy = options.tokens.find((t) => t.mint === options.buyMint)
  if (!sell || !buy) {
    throw new Error('Unknown sell or buy mint')
  }
  if (sell.mint === buy.mint) {
    throw new Error('Choose two different tokens')
  }
  if (!(options.buyAmount > 0) || !Number.isFinite(options.buyAmount)) {
    throw new Error('Enter a valid buy amount')
  }
  if (!(buy.priceUsd > 0) || !(sell.priceUsd > 0)) {
    throw new Error('Missing prices for quote')
  }

  const buyAmount = quantizeAmount(options.buyAmount, buy.decimals)
  const buyUsd = buyAmount * buy.priceUsd
  const rawSell = buyUsd / sell.priceUsd
  const sellAmount = ceilAmount(rawSell, sell.decimals)
  const sellUsd = sellAmount * sell.priceUsd
  const rate = sell.priceUsd / buy.priceUsd

  return { sellAmount, buyAmount, rate, sellUsd, buyUsd }
}

export function loadSwapAuthority(env: Bindings): Keypair {
  const secret = env.SWAP_AUTHORITY_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'SWAP_AUTHORITY_SECRET is not set (base58 secret of the mint/treasury wallet).',
    )
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    throw new Error(
      'SWAP_AUTHORITY_SECRET must be a base58-encoded secret key.',
    )
  }
}

export function getConnection(env: Bindings): Connection {
  const rpc = env.SOLANA_RPC_URL?.trim()
  if (!rpc) {
    throw new Error('SOLANA_RPC_URL is required for Devnet mock swaps.')
  }
  return new Connection(rpc, 'confirmed')
}

/**
 * Confirm deposit landed AND actually moved sell tokens into the treasury ATA.
 * A bare signature check is not enough — self-transfers (wallet === treasury)
 * succeed on-chain with zero net balance change and must be rejected.
 */
export async function assertDepositTransfer(options: {
  connection: Connection
  signature: string
  userAddress: string
  treasury: string
  sellMint: string
  sellAmountUi: number
  decimals: number
}): Promise<{
  rawAmount: bigint
  source: string
  destination: string
}> {
  const expectedRaw = BigInt(
    Math.round(Number(options.sellAmountUi) * 10 ** options.decimals),
  )
  if (expectedRaw <= 0n) {
    throw new Error('Invalid sell amount')
  }

  // Allow ±1 raw unit — percent sells often round UI floats vs on-chain integers.
  const minRaw = expectedRaw > 1n ? expectedRaw - 1n : expectedRaw
  const maxRaw = expectedRaw + 1n

  if (options.userAddress === options.treasury) {
    throw new Error(
      'Cannot swap with the treasury wallet — connect a different Devnet wallet.',
    )
  }

  const mint = new PublicKey(options.sellMint)
  const treasury = new PublicKey(options.treasury)
  const treasuryAta = getAssociatedTokenAddressSync(mint, treasury)

  const delays = [0, 100, 200, 400, 700, 1200]
  let tx: Awaited<ReturnType<Connection['getParsedTransaction']>> = null
  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
    tx = await options.connection.getParsedTransaction(options.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
    if (tx) {
      break
    }
  }
  if (!tx) {
    throw new Error(
      'Deposit signature not found on Devnet yet — wait a moment and retry.',
    )
  }
  if (tx.meta?.err) {
    throw new Error('Deposit transaction failed on-chain.')
  }

  type TransferHit = {
    source: string
    destination: string
    authority: string
    mint: string
    amount: bigint
  }
  const hits: TransferHit[] = []

  const visitIx = (ix: {
    program?: string
    programId?: PublicKey
    parsed?: {
      type?: string
      info?: Record<string, unknown>
    }
  }) => {
    const parsed = ix.parsed
    if (!parsed?.info) {
      return
    }
    const type = parsed.type
    if (type !== 'transferChecked' && type !== 'transfer') {
      return
    }
    const info = parsed.info
    const source = String(info.source ?? '')
    const destination = String(info.destination ?? '')
    const authority = String(info.authority ?? info.multisigAuthority ?? '')
    const mintStr = typeof info.mint === 'string' ? info.mint : options.sellMint
    let amount = 0n
    const tokenAmount = info.tokenAmount as { amount?: string } | undefined
    if (tokenAmount?.amount) {
      amount = BigInt(tokenAmount.amount)
    } else if (info.amount != null) {
      amount = BigInt(String(info.amount))
    }
    hits.push({ source, destination, authority, mint: mintStr, amount })
  }

  for (const ix of tx.transaction.message.instructions) {
    visitIx(ix as Parameters<typeof visitIx>[0])
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      visitIx(ix as Parameters<typeof visitIx>[0])
    }
  }

  const match = hits.find(
    (hit) =>
      hit.mint === options.sellMint &&
      hit.destination === treasuryAta.toBase58() &&
      hit.source !== hit.destination &&
      hit.amount >= minRaw &&
      hit.amount <= maxRaw &&
      hit.authority === options.userAddress,
  )

  // Same deposit, looser authority (some wallets omit / nest authority differently).
  const matchLoose =
    match ??
    hits.find(
      (hit) =>
        hit.mint === options.sellMint &&
        hit.destination === treasuryAta.toBase58() &&
        hit.source !== hit.destination &&
        hit.amount >= minRaw &&
        hit.amount <= maxRaw,
    )

  if (!matchLoose) {
    const selfTransfer = hits.some(
      (hit) => hit.mint === options.sellMint && hit.source === hit.destination,
    )
    if (selfTransfer) {
      throw new Error(
        'Deposit was a self-transfer (same token account). Use a wallet that is not the swap treasury.',
      )
    }
    const amounts = hits
      .filter((hit) => hit.mint === options.sellMint)
      .map((hit) => hit.amount.toString())
      .join(', ')
    throw new Error(
      `Deposit transaction did not transfer the expected sell tokens to the treasury` +
        (amounts
          ? ` (saw amounts [${amounts}], expected ~${expectedRaw}).`
          : '.'),
    )
  }

  return {
    rawAmount: matchLoose.amount,
    source: matchLoose.source,
    destination: matchLoose.destination,
  }
}

/**
 * Poll signature status. Avoid web3.js confirmTransaction in Workers — its
 * websocket/race path often throws "block height exceeded" even after the tx
 * has already finalized on Devnet.
 */
async function confirmSignaturePolled(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 45_000) {
    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    })
    const value = status?.value?.[0]
    if (value?.err) {
      throw new Error(`Payout transaction failed: ${JSON.stringify(value.err)}`)
    }
    if (
      value?.confirmationStatus === 'confirmed' ||
      value?.confirmationStatus === 'finalized'
    ) {
      return
    }

    const height = await connection.getBlockHeight('confirmed')
    if (height > lastValidBlockHeight) {
      // Final lookup — tx may have landed while the Worker missed the race.
      const again = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      })
      const landed = again?.value?.[0]
      if (landed?.err) {
        throw new Error(
          `Payout transaction failed: ${JSON.stringify(landed.err)}`,
        )
      }
      if (
        landed?.confirmationStatus === 'confirmed' ||
        landed?.confirmationStatus === 'finalized'
      ) {
        return
      }
      throw new Error(
        `Signature ${signature} has expired: block height exceeded.`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 350))
  }

  const late = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  })
  const value = late?.value?.[0]
  if (
    value &&
    !value.err &&
    (value.confirmationStatus === 'confirmed' ||
      value.confirmationStatus === 'finalized')
  ) {
    return
  }
  throw new Error(`Timed out confirming signature ${signature}`)
}

/**
 * Sign + send with a fresh blockhash; rebuild once if block height expires.
 */
async function sendAuthorityTx(
  connection: Connection,
  authority: Keypair,
  build: () => Transaction,
  skipPreflight = false,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let signature: string | undefined
    try {
      const tx = build()
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash
      tx.feePayer = authority.publicKey
      tx.sign(authority)

      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: skipPreflight || attempt > 0,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      })

      await confirmSignaturePolled(connection, signature, lastValidBlockHeight)
      return signature
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)

      // Workers can still race: treat an already-landed signature as success.
      if (signature) {
        try {
          const statuses = await connection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          })
          const landed = statuses?.value?.[0]
          if (
            landed &&
            !landed.err &&
            (landed.confirmationStatus === 'confirmed' ||
              landed.confirmationStatus === 'finalized')
          ) {
            return signature
          }
        } catch {
          // fall through to retry / throw
        }
      }

      const expired =
        message.includes('block height exceeded') ||
        message.includes('has expired') ||
        message.includes('Blockhash not found')
      if (!expired || attempt === 1) {
        throw error instanceof Error ? error : new Error(message)
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Payout failed after retry')
}

/**
 * Instant mock payout — always mintTo (mint authority), no slow treasury balance RPC.
 */
export async function payoutBuyTokens(options: {
  connection: Connection
  authority: Keypair
  userAddress: string
  buyMint: string
  buyAmountUi: number
  decimals: number
}): Promise<string> {
  const mint = new PublicKey(options.buyMint)
  const user = new PublicKey(options.userAddress)
  const authority = options.authority.publicKey
  const rawAmount = BigInt(
    Math.round(options.buyAmountUi * 10 ** options.decimals),
  )
  if (rawAmount <= 0n) {
    throw new Error('Buy amount too small')
  }

  const userAta = getAssociatedTokenAddressSync(mint, user)

  return sendAuthorityTx(options.connection, options.authority, () => {
    const tx = new Transaction()
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        authority,
        userAta,
        user,
        mint,
      ),
      createMintToInstruction(
        mint,
        userAta,
        authority,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID,
      ),
    )
    return tx
  })
}

/** Demo faucet — mint mock USDC to the connected wallet (authority-signed). */
export const FAUCET_USDC_AMOUNT = 5_000

/**
 * Mint 5,000 mock USDC on-chain. Authority pays rent + fees, so the user
 * never signs. Also drips Devnet SOL when the wallet cannot pay swap fees.
 */
export async function faucetMockTokens(options: {
  connection: Connection
  authority: Keypair
  userAddress: string
  tokens: SwapToken[]
}): Promise<string> {
  const usdc = options.tokens.find((token) => token.symbol === 'USDC')
  if (!usdc) {
    throw new Error('USDC mint is not configured.')
  }

  const user = new PublicKey(options.userAddress)
  const authority = options.authority.publicKey
  const mint = new PublicKey(usdc.mint)
  const userAta = getAssociatedTokenAddressSync(
    mint,
    user,
    false,
    TOKEN_PROGRAM_ID,
  )
  const raw = BigInt(Math.round(FAUCET_USDC_AMOUNT * 10 ** usdc.decimals))

  /** Enough for several swap deposit txs; skip if the wallet already has SOL. */
  const FAUCET_SOL_LAMPORTS = 100_000_000 // 0.1 SOL
  const MIN_SOL_LAMPORTS = 20_000_000 // 0.02 SOL
  const solBalance = await options.connection.getBalance(user)
  const needsSol = solBalance < MIN_SOL_LAMPORTS

  return sendAuthorityTx(
    options.connection,
    options.authority,
    () => {
      const tx = new Transaction()
      if (needsSol) {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: authority,
            toPubkey: user,
            lamports: FAUCET_SOL_LAMPORTS,
          }),
        )
      }
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          authority,
          userAta,
          user,
          mint,
          TOKEN_PROGRAM_ID,
        ),
        createMintToInstruction(
          mint,
          userAta,
          authority,
          raw,
          [],
          TOKEN_PROGRAM_ID,
        ),
      )
      return tx
    },
    true,
  )
}

function roundAmount(value: number, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 8)
  return Math.floor(value * scale) / scale
}

function ceilAmount(value: number, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 8)
  return Math.ceil(value * scale - 1e-12) / scale
}

/** Preserve whole-share buys (1, 10) without float drift; floor dust only. */
function quantizeAmount(value: number, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 8)
  return Math.round(value * scale) / scale
}
