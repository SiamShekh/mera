import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { SolanaWalletProvider } from '@/components/wallet/SolanaWalletProvider'

import './index.css'

// Solana libs expect Buffer in the browser
;(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SolanaWalletProvider>
      <App />
    </SolanaWalletProvider>
  </StrictMode>,
)
