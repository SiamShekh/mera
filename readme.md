# Mera: Programmable Portfolio

A Solana portfolio that runs on **rules you write in plain English**.

Describe when and how your holdings should change — for example, _“If NVDA drops, move more into USDC”_ — and the system turns that into executable rules. When conditions match, the keeper can enforce them on-chain.

## Network

**Solana Devnet only.** Tokens are **mock USDC** and **mock NVDAx** (not real Backed xStocks). There is no Mainnet deploy and no Jupiter liquidity in this build.

## How it works

1. **Prompt** — You describe a strategy in natural language.
2. **Rules** — The prompt is compiled into a clear rule set: conditions, assets, and actions.
3. **Monitor** — Mock prices / vault state are checked against those conditions.
4. **Execute** — When a rule fires, `enforce_rule` runs (Devnet: condition check; swap data can be empty).

## Project structure

```
hackathon/
├── frontend/   # React + Vite (Solana wallet on Devnet)
├── backend/    # API, AI compile, keeper
└── program/    # Anchor vault + rules
```

## Stack

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui         |
| Wallet   | Solana Kit on **Devnet**                                    |
| Program  | Anchor (`mera_portfolio`) on Devnet                         |

## Getting started

### 1. Mock mints + program (Devnet)

```bash
cd program
solana config set --url https://api.devnet.solana.com
solana airdrop 2
bash scripts/setup-devnet-mints.sh
anchor build
anchor deploy --provider.cluster devnet
```

Copy mints + program id into `frontend/.env` (see `.env.example`).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Set Phantom / Solflare to **Devnet**.

```env
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_USDC_MINT=...
VITE_NVDAX_MINT=...
VITE_MERA_PROGRAM_ID=...
```

### 3. Backend

```bash
cd backend
npm install
# set PROGRAM_ID + SOLANA_RPC_URL=https://api.devnet.solana.com in wrangler.toml / .dev.vars
npm run dev
```

## Status

Hackathon build on **Devnet** with mock USDC / xStock. Natural-language rules + keeper scaffolding in place.

## License

Private / hackathon project.
