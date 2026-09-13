import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { SOLANA_RPC_URL } from '@/lib/config'

export type ActivityItem = {
  signature: string
  slot: number
  err: unknown
  blockTime: number | null
}

type ActivityState = {
  items: ActivityItem[]
  loading: boolean
  error: string | null
  owner: string | null
}

const initialState: ActivityState = {
  items: [],
  loading: false,
  error: null,
  owner: null,
}

type RpcContextValue<T> = { value: T }

async function fetchRecentActivity(owner: string): Promise<ActivityItem[]> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [owner, { limit: 20 }],
    }),
  })

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`)
  }

  const json = (await response.json()) as {
    result?: ActivityItem[] | RpcContextValue<ActivityItem[]>
    error?: { message?: string }
  }

  if (json.error) {
    throw new Error(json.error.message ?? 'RPC error')
  }

  const result = json.result
  if (!result) {
    return []
  }
  if (Array.isArray(result)) {
    return result
  }
  return result.value ?? []
}

export const loadActivity = createAsyncThunk(
  'activity/load',
  async (ownerAddress: string) => {
    const items = await fetchRecentActivity(ownerAddress)
    return { items, owner: ownerAddress }
  },
)

const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    clearActivity(state) {
      state.items = []
      state.error = null
      state.owner = null
      state.loading = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadActivity.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadActivity.fulfilled, (state, action) => {
        state.loading = false
        state.items = action.payload.items
        state.owner = action.payload.owner
      })
      .addCase(loadActivity.rejected, (state, action) => {
        state.loading = false
        state.items = []
        state.error = action.error.message ?? 'Could not load activity'
      })
  },
})

export const { clearActivity } = activitySlice.actions
export default activitySlice.reducer
