# Programmable Portfolio

A Solana portfolio that runs on **rules you write in plain English**.

Describe when and how your holdings should change — for example, *“If SOL drops 10% in 24 hours, move 20% into USDC”* — and the system turns that into executable rules. When market conditions match, the portfolio updates automatically.

## How it works

1. **Prompt** — You describe a strategy in natural language.
2. **Rules** — The prompt is compiled into a clear rule set: conditions, assets, and actions.
3. **Monitor** — Market data is watched against those conditions.
4. **Execute** — When a rule fires, the portfolio is rebalanced according to that rule set.

You keep control of intent; the system handles the “when” and “what to do next.”

## Example prompts

- *If BTC rises above $100k, take 15% profit into stablecoins.*
- *When ETH volatility spikes, reduce exposure by half and hold cash.*
- *Every Monday, rebalance so SOL, ETH, and USDC are equal weights.*

## Why it exists

Traditional portfolios are either fully manual or locked into rigid bots. Programmable Portfolio sits in between: strategies stay human-readable, while execution stays automated and consistent with the rules you defined.

## Project structure

```
hackathon/
├── frontend/   # React + Vite app (Solana wallet connect on Mainnet)
└── backend/    # API & rule engine (coming soon)
```

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Wallet   | Solana Kit (`@solana/kit` + `@solana/react`) on **Mainnet** |
| Chain    | `@solana/kit` |

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional: set a custom Mainnet RPC in `frontend/.env`:

```env
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### Scripts

| Command           | Description                |
|-------------------|----------------------------|
| `npm run dev`     | Start local dev server     |
| `npm run build`   | Typecheck + production build |
| `npm run lint`    | Run ESLint                 |
| `npm run preview` | Preview production build   |

## Status

Early hackathon build. Wallet connect on Solana Mainnet is in place; natural-language rules, market monitoring, and automated portfolio updates are the next milestones.

## License

Private / hackathon project.
