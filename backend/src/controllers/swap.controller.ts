import { AppError } from '../errors'
import { SwapDeposit } from '../models'
import {
  assertDepositTransfer,
  FAUCET_USDC_AMOUNT,
  faucetMockTokens,
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
  payoutBuyTokens,
  quoteSwap,
  quoteSwapForBuyAmount,
} from '../solana/mockSwap'
import { getPriceMap } from '../solana/priceEngine'
import type { Bindings } from '../types/env'
import type { SwapCompleteBody, SwapFaucetBody } from '../validators/swap'

export const swapController = {
  async config(env: Bindings) {
    const live = await getPriceMap(env)
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
    body: { sellMint: string; buyMint: string; sellAmount: number },
  ) {
    const live = await getPriceMap(env)
    const tokens = listConfiguredSwapTokens(env, live)
    try {
      return { ok: true as const, ...quoteSwap({ tokens, ...body }) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Quote failed'
      throw new AppError(400, message)
    }
  },

  /**
   * Idempotent complete: claim deposit signature BEFORE minting so retries
   * cannot double-credit.
   */
  async complete(env: Bindings, body: SwapCompleteBody) {
    // Use the same fresh price map as /config so escrow sizing matches settlement.
    const live = await getPriceMap(env)
    const tokens = listConfiguredSwapTokens(env, live)
    const sell = tokens.find((t) => t.mint === body.sellMint)
    const buy = tokens.find((t) => t.mint === body.buyMint)
    if (!sell || !buy) {
      throw new AppError(400, 'Unknown sell or buy mint')
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
      throw new AppError(400, message)
    }

    const claim = await claimDepositSlot({
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
      const finished = await waitForPayout(body.depositSignature)
      if (finished) {
        return {
          ok: true as const,
          buyAmount: Number(finished.buyAmount),
          payoutSignature: finished.payoutSignature,
          replay: true as const,
        }
      }
      throw new AppError(
        409,
        'Swap already in progress for this deposit — wait a moment.',
      )
    }

    // We own the claim — only this request may mint.
    let authority
    let connection
    try {
      authority = loadSwapAuthority(env)
      connection = getConnection(env)
    } catch (error) {
      await releaseClaim(body.depositSignature)
      const message =
        error instanceof Error ? error.message : 'Swap not configured'
      throw new AppError(503, message)
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

      const exactBuy = body.exactBuyAmount
      if (exactBuy && exactBuy > 0) {
        try {
          const target = quoteSwapForBuyAmount({
            tokens,
            sellMint: body.sellMint,
            buyMint: body.buyMint,
            buyAmount: exactBuy,
          })
          // Deposit covers exact share cost at live prices → mint exact qty.
          if (actualSellUi + 1e-9 >= target.sellAmount) {
            quote = {
              buyAmount: target.buyAmount,
              rate: target.rate,
              sellUsd: actualSellUi * sell.priceUsd,
              buyUsd: target.buyUsd,
            }
          } else {
            quote = quoteSwap({
              tokens,
              sellMint: body.sellMint,
              buyMint: body.buyMint,
              sellAmount: actualSellUi,
            })
          }
        } catch {
          quote = quoteSwap({
            tokens,
            sellMint: body.sellMint,
            buyMint: body.buyMint,
            sellAmount: actualSellUi,
          })
        }
      } else {
        quote = quoteSwap({
          tokens,
          sellMint: body.sellMint,
          buyMint: body.buyMint,
          sellAmount: actualSellUi,
        })
      }
      await SwapDeposit.updateOne(
        { signature: body.depositSignature },
        {
          $set: {
            sellAmount: String(actualSellUi),
            buyAmount: String(quote.buyAmount),
          },
        },
      )
    } catch (error) {
      await releaseClaim(body.depositSignature)
      const message =
        error instanceof Error ? error.message : 'Deposit not confirmed'
      throw new AppError(400, message)
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
      await releaseClaim(body.depositSignature)
      const message = error instanceof Error ? error.message : 'Payout failed'
      throw new AppError(502, message)
    }

    await SwapDeposit.updateOne(
      { signature: body.depositSignature },
      { $set: { payoutSignature } },
    )

    return {
      ok: true as const,
      buyAmount: quote.buyAmount,
      payoutSignature,
      replay: false as const,
    }
  },

  async faucet(env: Bindings, body: SwapFaucetBody) {
    const tokens = listConfiguredSwapTokens(env)
    const usdc = tokens.find((token) => token.symbol === 'USDC')
    if (!usdc) {
      throw new AppError(503, 'USDC mint is not configured on the backend.')
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
      console.log(
        `[faucet] minted ${FAUCET_USDC_AMOUNT} USDC → ${body.userAddress} ${signature}`,
      )
      return { ok: true as const, signature, usdcAmount: FAUCET_USDC_AMOUNT }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Faucet failed'
      throw new AppError(502, message)
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

async function claimDepositSlot(row: {
  signature: string
  userAddress: string
  sellMint: string
  buyMint: string
  sellAmount: string
  buyAmount: string
}): Promise<ClaimResult> {
  const found = await SwapDeposit.findOne({ signature: row.signature }).lean()
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
    await SwapDeposit.create({
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
    const row2 = await SwapDeposit.findOne({
      signature: row.signature,
    }).lean()
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

async function waitForPayout(signature: string) {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const row = await SwapDeposit.findOne({ signature }).lean()
    if (row?.payoutSignature) {
      return row
    }
  }
  return null
}

/** Allow a failed attempt to be retried safely. */
async function releaseClaim(signature: string) {
  await SwapDeposit.deleteOne({ signature })
}
