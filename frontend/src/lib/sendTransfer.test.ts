import { describe, expect, it } from 'vitest'

import { parseUiAmountToRaw } from '@/lib/sendTransfer'

describe('parseUiAmountToRaw', () => {
  it('converts SOL-style amounts to lamports', () => {
    expect(parseUiAmountToRaw('1', 9)).toBe(1_000_000_000n)
    expect(parseUiAmountToRaw('0.005', 9)).toBe(5_000_000n)
  })

  it('converts USDC-style amounts', () => {
    expect(parseUiAmountToRaw('12.34', 6)).toBe(12_340_000n)
  })

  it('rejects invalid input', () => {
    expect(() => parseUiAmountToRaw('abc', 9)).toThrow()
    expect(() => parseUiAmountToRaw('1.1234567', 6)).toThrow()
  })
})
