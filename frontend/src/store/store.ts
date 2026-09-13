import { configureStore } from '@reduxjs/toolkit'

import healthReducer from '@/store/healthSlice'
import activityReducer from '@/store/activitySlice'
import portfolioReducer from '@/store/portfolioSlice'

// One store for the whole app — add more slices here later
export const store = configureStore({
  reducer: {
    health: healthReducer,
    portfolio: portfolioReducer,
    activity: activityReducer,
  },
})

// Helpful TypeScript types for useSelector / useDispatch
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
