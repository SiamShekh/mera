# Mera Portfolio Program

Solana Anchor program for a **programmable portfolio vault** (mock tokenized stocks + mock USDC on **Devnet**).

## What it does

- User-owned **Portfolio PDA** vault (no custodial private keys)
- Deposit / withdraw any SPL / Token-2022 mint into vault ATAs
- On-chain rules: `MinAllocation`, `MaxAllocation`, `TakeProfit` (extensible enum)
- `enforce_rule` for keeper automation — on Devnet, empty `swap_ix_data` = condition check only (no Jupiter)

## Layout

```
program/
  programs/mera_portfolio/src/
  scripts/setup-devnet-mints.sh
  Anchor.toml
  FEES.md
```

## You need installed

```bash
# Rust (rustup), Solana CLI, Anchor 0.31.x, spl-token
solana --version
anchor --version
spl-token --version
```

## Build & keys

```bash
cd program
anchor keys list
# sync declare_id! / Anchor.toml with the generated program id
anchor build
```

## Devnet setup (mock USDC + NVDAx)

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
bash scripts/setup-devnet-mints.sh
```

Paste the printed mints into `frontend/.env` (`VITE_USDC_MINT`, `VITE_NVDAX_MINT`).

## Deploy (Devnet — free faucet SOL)

```bash
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet
```

Copy the program id into:

- `frontend` → `VITE_MERA_PROGRAM_ID`
- `backend` → `PROGRAM_ID` in `.dev.vars` / `wrangler.toml`

## Local tests

```bash
anchor test
```

## Fee costs

See [FEES.md](./FEES.md).

## Status

Hackathon target: **Devnet only**. Mock USDC / NVDAx; no Mainnet xStocks or Jupiter liquidity.

Next on your machine:

1. `bash scripts/setup-devnet-mints.sh`
2. `anchor deploy --provider.cluster devnet`
3. Put program id + mint ids in frontend/backend env
4. Open `/vault` with a **Devnet** wallet
