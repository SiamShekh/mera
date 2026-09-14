#!/usr/bin/env bash
# Create Devnet SPL mints for mock xStocks in program/xstocks-catalog.json.
# Reuses the existing mint-authority wallet (same as USDC / NVDAx).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="${ROOT}/xstocks-catalog.json"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
DECIMALS=6
MINT_AMOUNT="${MOCK_XSTOCK_AMOUNT:-500}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

need solana
need spl-token
need python3

if [[ ! -f "${CATALOG}" ]]; then
  echo "Missing ${CATALOG}" >&2
  exit 1
fi

echo "==> Using RPC: ${RPC}"
solana config set --url "${RPC}" >/dev/null

WALLET="$(solana address)"
echo "==> Wallet (mint authority / swap treasury): ${WALLET}"

BAL="$(solana balance | awk '{print $1}')"
echo "==> Balance: ${BAL} SOL"
if awk "BEGIN {exit !(${BAL} < 2)}"; then
  echo "==> Low balance — requesting airdrops…"
  solana airdrop 2 || true
  sleep 2
  solana airdrop 2 || true
fi

export CATALOG ROOT DECIMALS MINT_AMOUNT
python3 <<'PY'
import json, os, subprocess, shutil, time
from pathlib import Path

catalog_path = Path(os.environ["CATALOG"])
root = Path(os.environ["ROOT"])
decimals = os.environ["DECIMALS"]
amount = os.environ["MINT_AMOUNT"]

catalog = json.loads(catalog_path.read_text())
stocks = catalog["stocks"]

def create_mint(label: str) -> str:
    print(f"==> Creating mock {label} mint ({decimals} decimals)…", flush=True)
    out = subprocess.check_output(
        ["spl-token", "create-token", "--decimals", decimals],
        text=True,
    )
    mint = None
    for line in out.splitlines():
        if "Creating token" in line:
            mint = line.split()[2]
            break
    if not mint:
        raise RuntimeError(f"Failed to parse mint for {label}:\n{out}")
    subprocess.check_call(
        ["spl-token", "create-account", mint],
        stdout=subprocess.DEVNULL,
    )
    subprocess.check_call(
        ["spl-token", "mint", mint, amount],
        stdout=subprocess.DEVNULL,
    )
    print(f"    {label}={mint}", flush=True)
    return mint

mints = {}
for stock in stocks:
    sym = stock["symbol"]
    existing = stock.get("mint")
    if isinstance(existing, str) and len(existing) >= 32:
        print(f"==> Keeping existing {sym}={existing}", flush=True)
        mints[sym] = existing
        continue
    mints[sym] = create_mint(sym)
    time.sleep(0.35)

for stock in stocks:
    stock["mint"] = mints[stock["symbol"]]
    stock["decimals"] = 6
    stock.setdefault("faucetAmount", 2)
    stock.setdefault("icon", f"/tokens/{stock['symbol'].lower()}.png")

catalog_path.write_text(json.dumps(catalog, indent=2) + "\n")
print(f"Updated {catalog_path}")

for dest in (
    root.parent / "frontend" / "src" / "data" / "xstocksCatalog.json",
    root.parent / "backend" / "src" / "data" / "xstocksCatalog.json",
):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(catalog_path, dest)
    print(f"Synced {dest}")

# Regenerate typed TS modules consumed by the apps
stocks_literal = json.dumps(
    [
        {
            "symbol": s["symbol"],
            "name": s["name"],
            "underlying": s["underlying"],
            "priceUsd": s["priceUsd"],
            "icon": s["icon"],
            "mint": s["mint"],
            "decimals": s["decimals"],
            "faucetAmount": s["faucetAmount"],
        }
        for s in stocks
    ],
    indent=2,
)
ts_body = (
    "/** Auto-synced from program/xstocks-catalog.json — Devnet mock xStocks. */\n"
    "export type XStockEntry = {\n"
    "  symbol: string\n"
    "  name: string\n"
    "  underlying: string\n"
    "  priceUsd: number\n"
    "  icon: string\n"
    "  mint: string\n"
    "  decimals: number\n"
    "  faucetAmount: number\n"
    "}\n"
    "\n"
    f"export const XSTOCKS_CATALOG: XStockEntry[] = {stocks_literal}\n"
    "\n"
    "export const XSTOCK_BY_SYMBOL: Record<string, XStockEntry> = Object.fromEntries(\n"
    "  XSTOCKS_CATALOG.map((row) => [row.symbol, row]),\n"
    ")\n"
    "\n"
    "export const XSTOCK_BY_MINT: Record<string, XStockEntry> = Object.fromEntries(\n"
    "  XSTOCKS_CATALOG.map((row) => [row.mint, row]),\n"
    ")\n"
    "\n"
    "export const XSTOCK_PRICES: Record<string, number> = Object.fromEntries(\n"
    "  XSTOCKS_CATALOG.map((row) => [row.symbol, row.priceUsd]),\n"
    ")\n"
)
for dest in (
    root.parent / "frontend" / "src" / "data" / "xstocks.ts",
    root.parent / "backend" / "src" / "data" / "xstocks.ts",
):
    dest.write_text(ts_body)
    print(f"Synced {dest}")

devnet = root / "devnet-mints.json"
data = json.loads(devnet.read_text()) if devnet.exists() else {"network": "devnet"}
data["xstockMints"] = mints
prices = data.get("mockPricesUsd") or {}
minted = data.get("minted") or {}
for stock in stocks:
    prices[stock["symbol"]] = stock.get("priceUsd", 100)
    minted[stock["symbol"]] = int(amount)
data["mockPricesUsd"] = prices
data["minted"] = minted
devnet.write_text(json.dumps(data, indent=2) + "\n")
print(f"Updated {devnet}")
print(f"==> Created/kept {len(mints)} xStock mints")
PY

echo
echo "==> Done. Mock xStock mints ready for Swap / faucet / prices."
