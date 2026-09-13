import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'

import App from './App.tsx'
import { SolanaWalletProvider } from '@/components/wallet/SolanaWalletProvider'
import { store } from '@/store/store'

import './index.css'

// Solana libs expect Buffer in the browser
;(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Provider makes the Redux store available to every component */}
    <Provider store={store}>
      <SolanaWalletProvider>
        <App />
      </SolanaWalletProvider>
    </Provider>
  </StrictMode>,
)
