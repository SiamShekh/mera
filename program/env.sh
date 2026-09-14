#!/usr/bin/env bash
# Usage: source env.sh
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
echo "solana: $(command -v solana)"
solana --version
echo "anchor: $(command -v anchor)"
anchor --version
