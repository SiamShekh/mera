import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { fetchHoldings } from '@/lib/portfolio'
import type { Holding } from '@/types/holding'

type PortfolioState = {
  holdings: Holding[]
  loading: boolean
  error: string | null
  /** Last wallet we loaded for (helps avoid stale data) */
  owner: string | null
}

const initialState: PortfolioState = {
  holdings: [],
  loading: false,
  error: null,
  owner: null,
}

/** Pull the connected wallet's assets from the blockchain + prices */
export const loadPortfolio = createAsyncThunk(
  'portfolio/load',
  async (ownerAddress: string) => {
    const holdings = await fetchHoldings(ownerAddress)
    return { holdings, owner: ownerAddress }
  },
)

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    clearPortfolio(state) {
      state.holdings = []
      state.error = null
      state.owner = null
      state.loading = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPortfolio.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadPortfolio.fulfilled, (state, action) => {
        state.loading = false
        state.holdings = action.payload.holdings
        state.owner = action.payload.owner
      })
      .addCase(loadPortfolio.rejected, (state, action) => {
        state.loading = false
        state.holdings = []
        state.error = action.error.message ?? 'Could not load portfolio'
      })
  },
})

export const { clearPortfolio } = portfolioSlice.actions
export default portfolioSlice.reducer
