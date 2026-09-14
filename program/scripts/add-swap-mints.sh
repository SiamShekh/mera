#!/usr/bin/env bash
# Add SOLx + stX mock mints to an existing Devnet setup (keeps USDC/NVDAx).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
DECIMALS=6
SOLX_AMOUNT="${MOCK_SOLX_AMOUNT:-500}"
STX_AMOUNT="${MOCK_STX_AMOUNT:-400}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

create_mint_and_fund() {
  local label="$1"
  local amount="$2"
  local mint
  echo "==> Creating mock ${label} mint…" >&2
  mint="$(spl-token create-token --decimals "${DECIMALS}" | awk '/Creating token/ {print $3}')"
  spl-token create-account "${mint}" >/dev/null
  spl-token mint "${mint}" "${amount}" >/dev/null
  echo "    ${label}_MINT=${mint}" >&2
  printf '%s' "${mint}"
}

need solana
need spl-token
solana config set --url "${RPC}" >/dev/null

WALLET="$(solana address)"
echo "==> Wallet (must be your SWAP_AUTHORITY): ${WALLET}"

SOLX_MINT="$(create_mint_and_fund SOLx "${SOLX_AMOUNT}")"
STX_MINT="$(create_mint_and_fund stX "${STX_AMOUNT}")"

echo
echo "Add to frontend/.env:"
echo "VITE_SOLX_MINT=${SOLX_MINT}"
echo "VITE_STX_MINT=${STX_MINT}"
echo
echo "Add to backend/.dev.vars:"
echo "MOCK_SOLX_MINT=${SOLX_MINT}"
echo "MOCK_STX_MINT=${STX_MINT}"
echo "SWAP_AUTHORITY_SECRET=<base58 secret of ${WALLET}>"
