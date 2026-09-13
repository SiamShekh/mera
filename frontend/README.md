# Solana Portfolio Manager — Frontend

Vite + React + TypeScript app with Tailwind CSS, shadcn/ui, ESLint, and Solana wallet connect on **Devnet**.

## Setup

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — start local dev server
- `npm run build` — typecheck + production build
- `npm run lint` — run ESLint
- `npm run preview` — preview production build

## Wallet / network

- Network: Solana **Devnet**
- Default RPC: `https://api.devnet.solana.com` (override with `VITE_SOLANA_RPC_URL`)
- Supported wallets: Phantom, Solflare (via wallet adapter)
- Connection enables future `signTransaction` / `sendTransaction` for portfolio actions — private keys stay in the wallet

## Stack

- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (Button starter)
- ESLint
- `@solana/web3.js` + wallet-adapter
