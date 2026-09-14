/** Strip Mongoose internals for API responses. */
export function lean<T extends Record<string, unknown>>(
  doc: { toJSON?: () => unknown } | Record<string, unknown> | null | undefined,
): T | null {
  if (!doc) return null
  if (typeof (doc as { toJSON?: () => unknown }).toJSON === 'function') {
    return (doc as { toJSON: () => T }).toJSON()
  }
  const copy = { ...doc } as Record<string, unknown>
  Reflect.deleteProperty(copy, '_id')
  Reflect.deleteProperty(copy, '__v')
  return copy as T
}

export function leanRequired<T extends Record<string, unknown>>(
  doc: { toJSON?: () => unknown } | Record<string, unknown> | null | undefined,
): T {
  const value = lean<T>(doc)
  if (!value) {
    throw new Error('Expected document')
  }
  return value
}
