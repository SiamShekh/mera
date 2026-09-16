import { describe, expect, it } from 'vitest'

import { mergeWalletAndLocked } from '@/lib/portfolio'

describe('mergeWalletAndLocked', () => {
  it('keeps spendable wallet lots and adds escrow as locked rows', () => {
    const rows = mergeWalletAndLocked(
      [
        {
          mint: 'usdc',
          quantity: 50,
          decimals: 6,
          tokenProgram: 'Tokenkeg',
        },
      ],
      [{ mint: 'usdc', quantity: 80 }],
    )

    expect(rows).toEqual([
      {
        mint: 'usdc',
        quantity: 50,
        decimals: 6,
        tokenProgram: 'Tokenkeg',
        locked: false,
      },
      {
        mint: 'usdc',
        quantity: 80,
        decimals: 6,
        tokenProgram: 'Tokenkeg',
        locked: true,
      },
    ])
  })

  it('still shows a holding when the whole position is escrowed', () => {
    const rows = mergeWalletAndLocked([], [{ mint: 'nvdax', quantity: 5 }])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      mint: 'nvdax',
      quantity: 5,
      locked: true,
      decimals: 6,
    })
  })

  it('keeps Autopilot lots with different rule ids as separate rows', () => {
    const rows = mergeWalletAndLocked(
      [],
      [
        { mint: 'usdc', quantity: 80, ruleId: 'rule-a' },
        { mint: 'usdc', quantity: 40, ruleId: 'rule-b' },
      ],
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.ruleId)).toEqual(['rule-a', 'rule-b'])
    expect(rows.every((row) => row.locked)).toBe(true)
  })
})
