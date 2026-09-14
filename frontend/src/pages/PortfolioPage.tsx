import { WalletPanel } from '@/components/wallet/WalletPanel'

/** Connected-wallet portfolio dashboard + autopilot vault setup */
export function PortfolioPage() {
  return (
    <div className="space-y-8">
      {/* <VaultAutopilotPanel /> */}
      <WalletPanel />
    </div>
  )
}
