import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import App from './App.tsx'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SolanaProvider } from '@/components/wallet/SolanaProvider'
import { store } from '@/store/store'

import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <SolanaProvider>
          <App />
        </SolanaProvider>
      </ThemeProvider>
    </Provider>
  </StrictMode>,
)
