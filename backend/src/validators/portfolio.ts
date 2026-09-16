import { z } from 'zod'

import { solanaAddressSchema } from './user'

export const listLockedQuerySchema = z.object({
  userAddress: solanaAddressSchema,
})

export type ListLockedQuery = z.infer<typeof listLockedQuerySchema>
