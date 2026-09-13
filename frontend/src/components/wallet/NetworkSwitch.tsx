import { useNetwork } from '@/hooks/useNetwork'

/**
 * Checkbox switch:
 * - checked (ON)  → Devnet (test network)
 * - unchecked (OFF) → Mainnet
 */
export function NetworkSwitch() {
  const { isTestNetwork, setTestNetwork, networkConfig } = useNetwork()

  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">
        Test network (Devnet)
        <span className="mt-0.5 block text-xs">
          Off = Mainnet · Now: {networkConfig.label}
        </span>
      </span>
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={isTestNetwork}
        onChange={(event) => {
          setTestNetwork(event.target.checked)
        }}
      />
    </label>
  )
}
