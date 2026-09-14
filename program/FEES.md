# Fees & costs (programmable portfolio vault)

## What you pay rent for

| Account | When | Notes |
|---------|------|-------|
| **Portfolio PDA** (one per user) | `initialize_portfolio` | Holds up to **8 packed rules** — no per-rule PDA |
| Vault ATA (per mint) | First deposit of that mint | Unavoidable for autopilot custody |
| Mock mint creation | Devnet scripts only | **Do not run on Mainnet** |

There is **no** separate Rule PDA rent anymore.

## Devnet vs Mainnet

| | Devnet | Mainnet |
|--|--------|---------|
| Program deploy | Faucet SOL | Real SOL |
| Assets | Mock USDC / xStocks via `scripts/*.sh` | Real USDC / real tokenized stock mints |
| Swaps | Empty `swap_ix_data` = condition check only | Jupiter CPI with real liquidity |
| Mint scripts | `setup-devnet-mints.sh`, etc. | **Do not deploy mock mints** |

## One-time / setup (you / project)

| Item | Approx cost | Who pays |
|------|-------------|----------|
| Deploy Anchor program | Cluster SOL | You (deployer) |
| Create mock mints (**Devnet only**) | Tiny rent | You |
| Keeper keypair + SOL | For `enforce_rule` fees | You |
| RPC | Public or paid | You |

## Per user action (user wallet signs)

| Action | Approx fee | Notes |
|--------|------------|-------|
| `initialize_portfolio` | Tx fee + **one** Portfolio rent | Rules included in account size |
| Create vault ATA (per mint) | ATA rent | Once per mint deposited |
| `deposit` / `withdraw` | Base tx fee | Small |
| `add_rule` / `remove_rule` | Base tx fee | No extra account rent |
| `set_portfolio_paused` | Base tx fee | Small |

## Autopilot enforce (keeper pays)

| Item | Approx | Who pays |
|------|--------|----------|
| `enforce_rule` tx | Base tx fee | **Keeper** |
| Swap / rebalance | Jupiter path when `swap_ix_data` non-empty | N/A on Devnet mock |

## Important

- Devnet tokens from mint scripts are **fake**.
- Mainnet: point frontend/backend at **real** mint addresses; leave mock scripts unused.
