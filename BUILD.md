# Building Agent Forge

## Prerequisites

- Rust 1.79.0+ (for Anchor 0.30.x compatibility)
- Solana CLI 1.18.x
- Anchor CLI 0.30.1
- Node.js 18+

## Known Issues

### Toolchain Compatibility (Feb 2026)

The Solana/Anchor ecosystem is currently experiencing dependency conflicts:

- `blake3 v1.8.3` requires Rust 2024 edition (`edition2024` feature)
- This feature isn't stabilized in Cargo 1.84.0
- Anchor 0.32.x has transitive dependencies requiring newer Rust

**Workaround options:**

1. Use Rust nightly with `-Zunstable-options`
2. Wait for Anchor to update dependencies
3. Pin specific dependency versions in Cargo.toml

## Build Commands

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.22/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Install Anchor via AVM
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1

# Build program
cd agent-forge
anchor build

# Run tests
anchor test
```

## Program Structure

```
programs/agent-forge/
├── Cargo.toml      # Program dependencies
└── src/
    └── lib.rs      # Main program logic
        - Agent registration
        - Task creation with escrow
        - Task acceptance/completion
        - Payment release
        - Reputation tracking
```

## Deployment

```bash
# Deploy to devnet
solana config set --url devnet
anchor deploy

# Deploy to mainnet (requires SOL)
solana config set --url mainnet-beta
anchor deploy
```
