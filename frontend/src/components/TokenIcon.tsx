import { useState } from 'react'

import { iconForSymbol } from '@/lib/tokenIcons'
import { cn } from '@/lib/utils'

type TokenIconProps = {
  symbol: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: 'size-5 text-[9px]',
  md: 'size-7 text-[10px]',
  lg: 'size-9 text-sm',
} as const

/** Reliable token avatar — local SVG with letter fallback. */
export function TokenIcon({
  symbol,
  src,
  size = 'md',
  className,
}: TokenIconProps) {
  const [broken, setBroken] = useState(false)
  const resolved = src || iconForSymbol(symbol)

  if (!resolved || broken) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-foreground',
          SIZE[size],
          className,
        )}
        aria-hidden
      >
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={resolved}
      alt=""
      className={cn(
        'shrink-0 rounded-full bg-secondary object-cover',
        SIZE[size],
        className,
      )}
      onError={() => {
        setBroken(true)
      }}
    />
  )
}
