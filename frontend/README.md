# Solana Portfolio Manager — Frontend

Vite + React + TypeScript app with Tailwind CSS, shadcn/ui, ESLint, Prettier, and Solana Kit wallet connect on **Mainnet**.

## Setup

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — start local dev server
- `npm run build` — typecheck + production build
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run format:check` — check Prettier formatting
- `npm run test` — unit tests (no RPC / no Helius calls)
- `npm run preview` — preview production build

## Wallet / network

- Network: Solana **Mainnet** (`solana:mainnet`)
- RPC: set `VITE_SOLANA_RPC_URL` in `.env` (your Helius Mainnet URL)
- Stack: [`@solana/kit`](https://solana.com/docs/frontend/client) + [`@solana/react`](https://solana.com/docs/frontend/react-hooks) + wallet plugin
- Connection enables future `client.sendTransaction` for portfolio actions — private keys stay in the wallet

## Stack

- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (Button starter)
- ESLint + Prettier
- Redux Toolkit (backend health check)
- `@solana/kit` + `@solana/kit-plugin-rpc` + `@solana/kit-plugin-wallet` + `@solana/react`
