import {
  address,
  isAddress,
  lamports,
  type Address,
  type TransactionSigner,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'
import { getTransferToATAInstructionPlanAsync } from '@solana-program/token'

import type { AppClient } from '@/lib/solanaClient'
import type { Holding } from '@/types/holding'

/** Keep a little SOL so the account can still pay fees after MAX send */
export const SOL_FEE_RESERVE = 5_000_000n // 0.005 SOL

/**
 * Parse a decimal UI amount into raw token units (no float rounding bugs).
 */
export function parseUiAmountToRaw(uiAmount: string, decimals: number): bigint {
  const trimmed = uiAmount.trim().replace(/,/g, '')
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount')
  }

  const [wholePart, fracPart = ''] = trimmed.split('.')
  if (fracPart.length > decimals) {
    throw new Error(`Max ${decimals} decimal places`)
  }

  const whole = BigInt(wholePart || '0')
  const frac = BigInt(
    (fracPart + '0'.repeat(decimals)).slice(0, decimals) || '0',
  )
  const scale = 10n ** BigInt(decimals)
  return whole * scale + frac
}

export function isValidSolanaAddress(value: string): value is Address {
  return isAddress(value)
}

function signatureToString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value != null && typeof value === 'object' && 'toString' in value) {
    return String(value)
  }
  return ''
}

/**
 * Send SOL or an SPL token from the connected wallet to a recipient.
 * Returns the transaction signature (base58) for Solscan.
 */
export async function sendHoldingTransfer(options: {
  client: AppClient
  signer: TransactionSigner
  holding: Holding
  recipient: string
  uiAmount: string
}): Promise<string> {
  const { client, signer, holding, recipient, uiAmount } = options

  if (!isValidSolanaAddress(recipient)) {
    throw new Error('Enter a valid Solana wallet address')
  }

  const rawAmount = parseUiAmountToRaw(uiAmount, holding.decimals)
  if (rawAmount <= 0n) {
    throw new Error('Amount must be greater than zero')
  }

  const maxRaw = parseUiAmountToRaw(
    holding.quantity.toFixed(holding.decimals),
    holding.decimals,
  )

  if (holding.mint === 'native') {
    const spendable = maxRaw > SOL_FEE_RESERVE ? maxRaw - SOL_FEE_RESERVE : 0n
    if (rawAmount > spendable) {
      throw new Error('Not enough SOL (keep a small balance for network fees)')
    }

    const transfer = getTransferSolInstruction({
      source: signer,
      destination: address(recipient),
      amount: lamports(rawAmount),
    })

    const result = await client.sendTransaction([transfer])
    const signature = signatureToString(
      (result as { context?: { signature?: unknown } }).context?.signature ??
        result,
    )
    if (!signature) {
      throw new Error('Transaction sent but no signature returned')
    }
    return signature
  }

  if (rawAmount > maxRaw) {
    throw new Error(`Not enough ${holding.asset}`)
  }

  if (!holding.tokenProgram) {
    throw new Error('Unknown token program for this asset')
  }

  const plan = await getTransferToATAInstructionPlanAsync(
    {
      payer: signer,
      mint: address(holding.mint),
      authority: signer,
      recipient: address(recipient),
      amount: rawAmount,
      decimals: holding.decimals,
    },
    {
      tokenProgram: address(holding.tokenProgram),
    },
  )

  const result = await client.sendTransaction(plan)
  const signature = signatureToString(
    (result as { context?: { signature?: unknown } }).context?.signature ??
      result,
  )
  if (!signature) {
    throw new Error('Transaction sent but no signature returned')
  }
  return signature
}
