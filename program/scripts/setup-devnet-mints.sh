#!/usr/bin/env bash
# Create mock USDC + NVDAx + SOLx + stX SPL mints on Solana Devnet.
# Requires: solana CLI, spl-token CLI, funded Devnet keypair.
# The creating wallet becomes mint authority + swap treasury — keep that key for SWAP_AUTHORITY_SECRET.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/devnet-mints.json"
RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
DECIMALS=6
USDC_AMOUNT="${MOCK_USDC_AMOUNT:-100000}"
NVDAX_AMOUNT="${MOCK_NVDAX_AMOUNT:-1000}"
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
  echo "==> Creating mock ${label} mint (${DECIMALS} decimals)…" >&2
  mint="$(spl-token create-token --decimals "${DECIMALS}" | awk '/Creating token/ {print $3}')"
  spl-token create-account "${mint}" >/dev/null
  spl-token mint "${mint}" "${amount}" >/dev/null
  echo "    ${label}_MINT=${mint}" >&2
  printf '%s' "${mint}"
}

need solana
need spl-token

echo "==> Using RPC: ${RPC}"
solana config set --url "${RPC}" >/dev/null

WALLET="$(solana address)"
echo "==> Wallet (mint authority / swap treasury): ${WALLET}"

BAL="$(solana balance | awk '{print $1}')"
echo "==> Balance: ${BAL} SOL"
if awk "BEGIN {exit !(${BAL} < 1)}"; then
  echo "==> Low balance — requesting airdrop…"
  solana airdrop 2 || true
fi

USDC_MINT="$(create_mint_and_fund USDC "${USDC_AMOUNT}")"
NVDAX_MINT="$(create_mint_and_fund NVDAx "${NVDAX_AMOUNT}")"
SOLX_MINT="$(create_mint_and_fund SOLx "${SOLX_AMOUNT}")"
STX_MINT="$(create_mint_and_fund stX "${STX_AMOUNT}")"

cat > "${OUT}" <<EOF
{
  "network": "devnet",
  "rpc": "${RPC}",
  "wallet": "${WALLET}",
  "usdcMint": "${USDC_MINT}",
  "nvdaxMint": "${NVDAX_MINT}",
  "solxMint": "${SOLX_MINT}",
  "stxMint": "${STX_MINT}",
  "mockPricesUsd": { "USDC": 1, "NVDAx": 120, "SOLx": 150, "stX": 165 },
  "minted": {
    "USDC": ${USDC_AMOUNT},
    "NVDAx": ${NVDAX_AMOUNT},
    "SOLx": ${SOLX_AMOUNT},
    "stX": ${STX_AMOUNT}
  }
}
EOF

echo
echo "==> Wrote ${OUT}"
echo
echo "Add these to frontend/.env:"
echo "VITE_SOLANA_RPC_URL=${RPC}"
echo "VITE_USDC_MINT=${USDC_MINT}"
echo "VITE_NVDAX_MINT=${NVDAX_MINT}"
echo "VITE_SOLX_MINT=${SOLX_MINT}"
echo "VITE_STX_MINT=${STX_MINT}"
echo
echo "Add these to backend/.dev.vars:"
echo "SOLANA_RPC_URL=${RPC}"
echo "MOCK_USDC_MINT=${USDC_MINT}"
echo "MOCK_NVDAX_MINT=${NVDAX_MINT}"
echo "MOCK_SOLX_MINT=${SOLX_MINT}"
echo "MOCK_STX_MINT=${STX_MINT}"
echo "SWAP_AUTHORITY_SECRET=<base58 secret key of ${WALLET}>"
echo
echo "Then deploy the program:"
echo "  cd ${ROOT} && anchor deploy --provider.cluster devnet"
echo "  # copy program id → VITE_MERA_PROGRAM_ID + PROGRAM_ID"
