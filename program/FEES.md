# Fees & costs (Devnet programmable portfolio)

This project targets **Solana Devnet only**. No Mainnet deploy, no real USDC/xStock, no Jupiter liquidity.

## One-time / setup (you / project)

| Item | Approx cost | Who pays |
|------|-------------|----------|
| Deploy Anchor program to **Devnet** | Free (faucet SOL) | You (deployer wallet) |
| Create mock USDC + NVDAx mints | Tiny Devnet rent (~0.01 SOL order) | You |
| Create keeper keypair + keep Devnet SOL | Faucet | You |
| RPC | Public Devnet RPC is fine; Helius Devnet optional | You |
| Cloudflare Workers + D1 | Free tier usually enough for hackathon | You |
| Optional OpenAI for AI chat/compile | Usage-based ($ for tokens) | You |

## Per user action (user wallet signs)

| Action | Approx fee | Notes |
|--------|------------|-------|
| `initialize_portfolio` | Tiny Devnet fee + rent for Portfolio account | Rent recoverable if account closed later |
| Create vault ATA (per mint) | Rent for token account | Once per mint deposited |
| `deposit` / `withdraw` | Base tx fee | Small |
| `add_rule` | Base tx fee + rent for Rule account | Once per rule |
| Pause / resume | Base tx fee | Small |

## Autopilot enforce (keeper pays)

| Item | Approx | Who pays |
|------|--------|----------|
| `enforce_rule` tx | Tiny Devnet fee | **Keeper** |
| Swap / rebalance | **Skipped on Devnet** when `swap_ix_data` is empty | N/A |

Mock prices live in the frontend (`MOCK_USD_PRICES`: USDC = $1, NVDAx = $120). There is no real AMM.

## What you should budget for a hackathon demo

1. **Devnet SOL** from https://faucet.solana.com (a few SOL is plenty)
2. Run `bash program/scripts/setup-devnet-mints.sh` for mock USDC + NVDAx
3. Deploy: `anchor deploy --provider.cluster devnet`
4. Optional: OpenAI credits if you use cloud LLM

## What users feel

- Connect wallet (Devnet): free  
- Deposit / add rule: tiny Devnet SOL + rent once  
- Autopilot: keeper ticks rules; no Mainnet Jupiter  

## Important

Devnet tokens are **fake**. Switch Phantom/Solflare to **Devnet** before testing.
