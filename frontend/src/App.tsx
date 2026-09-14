import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/layouts/AppLayout'
import { DepositPage } from '@/pages/DepositPage'
import { MarketPage } from '@/pages/MarketPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { SendPage } from '@/pages/SendPage'
import { SwapPage } from '@/pages/SwapPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/swap" replace />} />
          <Route path="swap" element={<SwapPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="portfolio" element={<PortfolioPage />} />
          <Route path="deposit" element={<DepositPage />} />
          <Route path="send" element={<SendPage />} />
          <Route path="*" element={<Navigate to="/swap" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
