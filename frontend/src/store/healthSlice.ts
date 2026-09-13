import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { API_URL } from '@/lib/config'

// What the backend /health route returns
type HealthResponse = {
  status: string
}

// Shape of this slice's state
type HealthState = {
  status: string | null
  loading: boolean
  error: string | null
}

const initialState: HealthState = {
  status: null,
  loading: false,
  error: null,
}

/**
 * createAsyncThunk = "do an async job, then update Redux"
 * Steps: pending → fulfilled (ok) or rejected (error)
 */
export const checkBackendHealth = createAsyncThunk('health/check', async () => {
  const response = await fetch(`${API_URL}/health`)

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const data = (await response.json()) as HealthResponse
  return data
})

const healthSlice = createSlice({
  name: 'health',
  initialState,
  // Synchronous updates go here (we don't need any yet)
  reducers: {},
  // Handle the async thunk states
  extraReducers: (builder) => {
    builder
      .addCase(checkBackendHealth.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(checkBackendHealth.fulfilled, (state, action) => {
        state.loading = false
        state.status = action.payload.status
      })
      .addCase(checkBackendHealth.rejected, (state, action) => {
        state.loading = false
        state.status = null
        state.error = action.error.message ?? 'Something went wrong'
      })
  },
})

export default healthSlice.reducer
