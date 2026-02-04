# Building Agent Forge

## Quick Start

Agent Forge is written in **Solidity** and compiled with **Solang** to Solana BPF bytecode.

```bash
# Install Solang (one-time)
curl -sSL https://github.com/hyperledger/solang/releases/latest/download/solang-linux-x86-64 \
  -o /usr/local/bin/solang && chmod +x /usr/local/bin/solang

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Build
cd agent-forge
solang compile --target solana -o target/deploy contracts/AgentForge.sol

# Deploy to devnet
solana config set --url devnet
solana program deploy target/deploy/AgentForge.so
```

## Why Solidity?

We chose Solidity + Solang over Rust + Anchor because:
1. **Faster iteration** - Solidity is more concise for smart contract logic
2. **Avoids toolchain issues** - Rust/Anchor ecosystem has dependency conflicts (blake3 requires Rust 2024 edition)
3. **Familiar syntax** - If you know Ethereum, you can read this code

## Program Structure

```
contracts/
└── AgentForge.sol   # Main contract (300 lines)
    - Agent registration with reputation
    - Task creation with escrow
    - Task acceptance/submission/approval
    - Reputation = (completed / total) * 100

target/deploy/
├── AgentForge.json  # IDL/ABI for clients
└── AgentForge.so    # Compiled BPF bytecode (227KB)
```

## Key Functions

| Function | Description |
|----------|-------------|
| `registerAgent(owner, name, rate)` | Register as an agent |
| `createTask(creator, desc, budget, deadline)` | Create task with escrow |
| `acceptTask(agent, taskId)` | Agent accepts task |
| `submitResult(agent, taskId, resultUri)` | Submit work |
| `approveResult(creator, taskId)` | Approve and pay |
| `rejectResult(creator, taskId, reason)` | Reject (dispute) |

## Deployment

```bash
# Devnet (testing)
solana config set --url devnet
solana program deploy target/deploy/AgentForge.so

# Mainnet (production)
solana config set --url mainnet-beta
solana program deploy target/deploy/AgentForge.so
```

## Client Integration

Use the generated `AgentForge.json` IDL with `@solana/web3.js`:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';

const programId = new PublicKey('AgentForge111111111111111111111111111111111');
// ... interact with program
```
