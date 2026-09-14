import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { Db } from '../db'
import { swapDeposits } from '../db/schema'
import {
  assertDepositTransfer,
  faucetMockTokens,
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
  payoutBuyTokens,
  quoteSwap,
} from '../solana/mockSwap'
import { getPriceBook, getPriceMap } from '../solana/priceEngine'
import type { Bindings } from '../types/env'
import type { SwapCompleteBody, SwapFaucetBody } from '../validators/swap'

export const swapController = {
  async config(env: Bindings, db: Db) {
    const live = await getPriceMap(db, env)
    const tokens = listConfiguredSwapTokens(env, live)
    let treasury: string | null
    try {
      treasury = loadSwapAuthority(env).publicKey.toBase58()
    } catch {
      treasury = null
    }
    const ready =
      tokens.length >= 2 && Boolean(env.SOLANA_RPC_URL) && Boolean(treasury)
    return { ready, treasury, tokens, network: 'devnet' as const }
  },

  async quote(
    env: Bindings,
    db: Db,
    body: { sellMint: string; buyMint: string; sellAmount: number },
  ) {
    const live = await getPriceMap(db, env)
    const tokens = listConfiguredSwapTokens(env, live)
    try {
      return { ok: true as const, ...quoteSwap({ tokens, ...body }) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quote failed'
      throw new HTTPException(400, { message })
    }
  },

  /**
   * Idempotent complete: claim deposit signature in D1 BEFORE minting so retries
   * cannot double-credit.
   */
  async complete(env: Bindings, db: Db, body: SwapCompleteBody) {
    const book = await getPriceBook(db)
    const live: Record<string, number> = {}
    for (const row of book.prices) {
      live[row.mint] = row.priceUsd
      live[row.symbol] = row.priceUsd
    }
    const tokens = listConfiguredSwapTokens(env, live)
    const sell = tokens.find((t) => t.mint === body.sellMint)
    const buy = tokens.find((t) => t.mint === body.buyMint)
    if (!sell || !buy) {
      throw new HTTPException(400, { message: 'Unknown sell or buy mint' })
    }

    let quote
    try {
      quote = quoteSwap({
        tokens,
        sellMint: body.sellMint,
        buyMint: body.buyMint,
        sellAmount: body.sellAmount,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quote failed'
      throw new HTTPException(400, { message })
    }

    const claim = await claimDepositSlot(db, {
      signature: body.depositSignature,
      userAddress: body.userAddress,
      sellMint: body.sellMint,
      buyMint: body.buyMint,
      sellAmount: String(body.sellAmount),
      buyAmount: String(quote.buyAmount),
    })

    if (claim.kind === 'done') {
      return {
        ok: true as const,
        buyAmount: Number(claim.buyAmount),
        payoutSignature: claim.payoutSignature,
        replay: true as const,
      }
    }

    if (claim.kind === 'pending') {
      const finished = await waitForPayout(db, body.depositSignature)
      if (finished) {
        return {
          ok: true as const,
          buyAmount: Number(finished.buyAmount),
          payoutSignature: finished.payoutSignature,
          replay: true as const,
        }
      }
      throw new HTTPException(409, {
        message: 'Swap already in progress for this deposit — wait a moment.',
      })
    }

    // We own the claim — only this request may mint.
    let authority
    let connection
    try {
      authority = loadSwapAuthority(env)
      connection = getConnection(env)
    } catch (error) {
      await releaseClaim(db, body.depositSignature)
      const message =
        error instanceof Error ? error.message : 'Swap not configured'
      throw new HTTPException(503, { message })
    }

    try {
      const deposit = await assertDepositTransfer({
        connection,
        signature: body.depositSignature,
        userAddress: body.userAddress,
        treasury: authority.publicKey.toBase58(),
        sellMint: body.sellMint,
        sellAmountUi: body.sellAmount,
        decimals: sell.decimals,
      })
      // Prefer on-chain raw amount so float UI rounding never over-credits.
      const actualSellUi = Number(deposit.rawAmount) / 10 ** sell.decimals
      quote = quoteSwap({
        tokens,
        sellMint: body.sellMint,
        buyMint: body.buyMint,
        sellAmount: actualSellUi,
      })
      await db
        .update(swapDeposits)
        .set({
          sellAmount: String(actualSellUi),
          buyAmount: String(quote.buyAmount),
        })
        .where(eq(swapDeposits.signature, body.depositSignature))
    } catch (error) {
      await releaseClaim(db, body.depositSignature)
      const message =
        error instanceof Error ? error.message : 'Deposit not confirmed'
      throw new HTTPException(400, { message })
    }

    let payoutSignature: string
    try {
      payoutSignature = await payoutBuyTokens({
        connection,
        authority,
        userAddress: body.userAddress,
        buyMint: body.buyMint,
        buyAmountUi: quote.buyAmount,
        decimals: buy.decimals,
      })
    } catch (error) {
      await releaseClaim(db, body.depositSignature)
      const message = error instanceof Error ? error.message : 'Payout failed'
      throw new HTTPException(502, { message })
    }

    await db
      .update(swapDeposits)
      .set({ payoutSignature })
      .where(eq(swapDeposits.signature, body.depositSignature))

    return {
      ok: true as const,
      buyAmount: quote.buyAmount,
      payoutSignature,
      replay: false as const,
    }
  },

  async faucet(env: Bindings, body: SwapFaucetBody) {
    const tokens = listConfiguredSwapTokens(env)
    if (tokens.length === 0) {
      throw new HTTPException(503, {
        message: 'No mock mints configured on the backend.',
      })
    }

    try {
      const authority = loadSwapAuthority(env)
      const connection = getConnection(env)
      const signature = await faucetMockTokens({
        connection,
        authority,
        userAddress: body.userAddress,
        tokens,
      })
      return { ok: true as const, signature }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Faucet failed'
      throw new HTTPException(502, { message })
    }
  },
}

type ClaimResult =
  | {
      kind: 'done'
      buyAmount: string
      payoutSignature: string | null
    }
  | { kind: 'pending' }
  | { kind: 'claimed' }

async function claimDepositSlot(
  db: Db,
  row: {
    signature: string
    userAddress: string
    sellMint: string
    buyMint: string
    sellAmount: string
    buyAmount: string
  },
): Promise<ClaimResult> {
  const existing = await db
    .select()
    .from(swapDeposits)
    .where(eq(swapDeposits.signature, row.signature))
    .limit(1)

  const found = existing[0]
  if (found?.payoutSignature) {
    return {
      kind: 'done',
      buyAmount: found.buyAmount,
      payoutSignature: found.payoutSignature,
    }
  }
  if (found && !found.payoutSignature) {
    return { kind: 'pending' }
  }

  try {
    await db.insert(swapDeposits).values({
      signature: row.signature,
      userAddress: row.userAddress,
      sellMint: row.sellMint,
      buyMint: row.buyMint,
      sellAmount: row.sellAmount,
      buyAmount: row.buyAmount,
      payoutSignature: null,
    })
    return { kind: 'claimed' }
  } catch {
    const again = await db
      .select()
      .from(swapDeposits)
      .where(eq(swapDeposits.signature, row.signature))
      .limit(1)
    const row2 = again[0]
    if (row2?.payoutSignature) {
      return {
        kind: 'done',
        buyAmount: row2.buyAmount,
        payoutSignature: row2.payoutSignature,
      }
    }
    return { kind: 'pending' }
  }
}

async function waitForPayout(db: Db, signature: string) {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const rows = await db
      .select()
      .from(swapDeposits)
      .where(eq(swapDeposits.signature, signature))
      .limit(1)
    const row = rows[0]
    if (row?.payoutSignature) {
      return row
    }
  }
  return null
}

/** Allow a failed attempt to be retried safely. */
async function releaseClaim(db: Db, signature: string) {
  await db.delete(swapDeposits).where(eq(swapDeposits.signature, signature))
}
