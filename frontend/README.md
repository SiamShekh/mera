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
- `npm run test` — unit tests (no RPC)
- `npm run preview` — preview production build

## Pages (React Router)

| Path         | Page                              |
| ------------ | --------------------------------- |
| `/swap`      | Swap placeholder (no trading yet) |
| `/portfolio` | Wallet + holdings dashboard       |
| `/vault`     | Autopilot vault hub               |
| `/`          | Redirects to `/swap`              |

## Wallet / network

- Network: Solana **Devnet** (`solana:devnet`)
- RPC: `VITE_SOLANA_RPC_URL` (default `https://api.devnet.solana.com`)
- Mock mints: `VITE_USDC_MINT`, `VITE_NVDAX_MINT` from `program/scripts/setup-devnet-mints.sh`
- Program: `VITE_MERA_PROGRAM_ID` after `anchor deploy --provider.cluster devnet`
- Set Phantom / Solflare to **Devnet**

## Stack

- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (Button starter)
- ESLint + Prettier
- Redux Toolkit
- `@solana/kit` + `@solana/kit-plugin-rpc` + `@solana/kit-plugin-wallet` + `@solana/react`
