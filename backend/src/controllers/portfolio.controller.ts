import { RuleModel, SwapDeposit } from '../models'

export type LockedLot = {
  mint: string
  quantity: number
  /** Autopilot rule that escrowed this lot — used to cancel + refund. */
  ruleId?: string | null
}

/**
 * Tokens the user still owns but has already sent to the swap treasury
 * (Autopilot escrow or an in-flight spot swap). Counted in net worth.
 * Autopilot lots stay per-rule so each order can be cancelled on its own.
 */
export async function listLockedLots(userAddress: string): Promise<LockedLot[]> {
  const [rules, deposits] = await Promise.all([
    RuleModel.find({
      userAddress,
      executedAt: null,
      mint: { $type: 'string' },
      escrowDepositSig: { $type: 'string' },
      escrowSellAmount: { $gt: 0 },
    }).lean(),
    SwapDeposit.find({
      userAddress,
      payoutSignature: null,
    }).lean(),
  ])

  const lots: LockedLot[] = []
  const seenSigs = new Set<string>()

  for (const rule of rules) {
    const mint = rule.mint ?? ''
    const quantity = Number(rule.escrowSellAmount)
    const signature = rule.escrowDepositSig ?? ''
    if (!mint || !(quantity > 0)) continue
    if (signature) {
      if (seenSigs.has(signature)) continue
      seenSigs.add(signature)
    }
    lots.push({
      mint,
      quantity,
      ruleId: typeof rule.id === 'string' ? rule.id : null,
    })
  }

  const qtyByMint = new Map<string, number>()
  for (const deposit of deposits) {
    const mint = deposit.sellMint
    const quantity = Number(deposit.sellAmount)
    const signature = deposit.signature
    if (!mint || !(quantity > 0)) continue
    if (signature) {
      if (seenSigs.has(signature)) continue
      seenSigs.add(signature)
    }
    qtyByMint.set(mint, (qtyByMint.get(mint) ?? 0) + quantity)
  }

  for (const [mint, quantity] of qtyByMint) {
    lots.push({ mint, quantity, ruleId: null })
  }

  return lots
}

export const portfolioController = {
  async locked(userAddress: string) {
    const locked = await listLockedLots(userAddress)
    return { locked }
  },
}
