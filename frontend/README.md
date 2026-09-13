# Solana Portfolio Manager — Frontend

Vite + React + TypeScript app with Tailwind CSS, shadcn/ui, ESLint, Prettier, and Solana Kit wallet connect on **Devnet**.

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
- `npm run preview` — preview production build

## Wallet / network

- Toggle **Test network (Devnet)** ON = Devnet, OFF = Mainnet (saved in localStorage)
- Default for development: **Devnet**
- RPC overrides: `VITE_SOLANA_DEVNET_RPC_URL`, `VITE_SOLANA_MAINNET_RPC_URL`
- Stack: [`@solana/kit`](https://solana.com/docs/frontend/client) + [`@solana/react`](https://solana.com/docs/frontend/react-hooks) + wallet plugin
- Connection enables future `client.sendTransaction` for portfolio actions — private keys stay in the wallet

## Stack

- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (Button starter)
- ESLint + Prettier
- Redux Toolkit (backend health check)
- `@solana/kit` + `@solana/kit-plugin-rpc` + `@solana/kit-plugin-wallet` + `@solana/react`
