# Mera Portfolio Program

Solana Anchor program for a **programmable portfolio vault** (autopilot rules + keeper enforce).

## What it does

- User-owned **Portfolio PDA** vault (no custodial private keys)
- Deposit / withdraw any SPL / Token-2022 mint into vault ATAs
- Up to **8 rules packed inside the Portfolio account** (no per-rule PDA → lower rent)
- Rule kinds: `MinAllocation`, `MaxAllocation`, `TakeProfit`
- `enforce_rule` for keeper automation — empty `swap_ix_data` = condition check only (Devnet); non-empty = Jupiter CPI

## Instructions

| Instruction | Purpose |
|-------------|---------|
| `initialize_portfolio` | Create Portfolio PDA (rules slots pre-allocated) |
| `deposit` / `withdraw` | Move tokens into / out of vault ATAs |
| `add_rule` / `remove_rule` | Write / clear a rule slot |
| `set_portfolio_paused` | Pause or resume the whole portfolio |
| `enforce_rule` | Keeper: check rule by id, optional swap |

## Layout

```
program/
  programs/mera_portfolio/src/
  scripts/setup-devnet-mints.sh   # Devnet only
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

**Mainnet:** do **not** run mint scripts. Use real USDC / tokenized-stock mint addresses and Jupiter liquidity.

## Deploy

```bash
# Devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# Mainnet (real mints only — no mock scripts)
# anchor deploy --provider.cluster mainnet
```

Copy the program id into:

- `frontend` → `VITE_MERA_PROGRAM_ID`
- `backend` → `PROGRAM_ID` in `.dev.vars` / `wrangler.toml`

## Local tests

```bash
anchor test
```

## Fee costs

See [FEES.md](./FEES.md). Rent is dominated by **one Portfolio PDA + vault ATAs**, not N rule accounts.

## Status

- Program works with **any** mint pubkey (mock or real).
- Mock mint scripts are **Devnet tooling only**.
- Next: `anchor build` → deploy → set program id + mint ids in frontend/backend env.
