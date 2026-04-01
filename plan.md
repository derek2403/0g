# PrivTrain on 0G: Federated Learning Framework Plan

## Overview

A decentralized federated learning framework built on 0G (Zero Gravity) that enables privacy-preserving collaborative model training. Participants locally train models, submit updates via 0G Storage, coordinate rounds through on-chain smart contracts, and optionally use 0G Compute for GPU-accelerated training. The final aggregated model is minted as an INFT (ERC-7857).

---

## How It Works (High-Level Flow)

```
1. Coordinator creates a new FL task (deploys contract, uploads initial model to 0G Storage)
2. Participants register on-chain and download the global model from 0G Storage
3. Each participant trains locally (or via 0G Compute if no local GPU)
4. Participants upload model updates (gradients/weights) to 0G Storage
5. Participants submit the storage Merkle root on-chain as proof of update
6. Once enough updates are submitted, aggregation is triggered
7. Aggregator downloads all updates from 0G Storage, performs FedAvg, uploads new global model
8. Smart contract advances to next round
9. Repeat until target accuracy / round limit reached
10. Final model is minted as an INFT
```

---

## Architecture Components

### 1. Smart Contracts (Solidity on 0G Chain)

**FederatedLearning.sol** - Core coordination contract

| Function | Purpose |
|----------|---------|
| `createTask()` | Initialize a new FL task with config (rounds, min participants, reward pool) |
| `register()` | Participant joins a task, stakes tokens |
| `submitUpdate(roundId, merkleRoot)` | Submit proof of model update (Merkle root from 0G Storage) |
| `triggerAggregation(roundId)` | Called when min updates received; locks round |
| `publishGlobalModel(roundId, merkleRoot)` | Aggregator publishes new global model reference |
| `claimReward()` | Participants claim rewards based on contribution score |
| `slash(participant)` | Penalize malicious or absent participants |

**Reward calculation:**
- Based on number of rounds participated, data quality score (gradient norm checks), and consistency
- Funded by task creator depositing tokens into the contract

**PrivTrainINFT.sol** - ERC-7857 INFT contract
- Mints the final aggregated model as a tradeable INFT
- Encrypted model weights stored via 0G Storage, referenced by token
- Ownership transfer triggers secure re-encryption

### 2. 0G Storage Integration

**Purpose:** Store and retrieve model weights, gradients, and datasets

| Operation | 0G Storage Layer | Why |
|-----------|-----------------|-----|
| Global model weights | KV Layer (mutable) | Updated each round, needs to be overwritable |
| Participant updates (gradients) | Log Layer (immutable) | Append-only audit trail, one entry per participant per round |
| Training datasets | Log Layer (immutable) | Write-once, read-many |
| INFT model blob | Log Layer (immutable) | Final model, permanently stored |

**SDK:** `@0gfoundation/0g-ts-sdk`

**Key flow:**
```
Upload: serialize model -> ZgFile or MemData -> upload to 0G Storage -> get Merkle root
Download: Merkle root -> indexer.download() -> deserialize model
```

The Merkle root acts as a tamper-proof fingerprint. It's submitted on-chain so anyone can verify the update hasn't been modified.

### 3. 0G Compute Integration (Optional)

**Purpose:** Participants without local GPUs can use 0G's decentralized GPU marketplace

**When to use:**
- Participant has no local GPU
- Model is too large for local training (e.g. fine-tuning LLMs)
- Participant wants TEE-verified training for trust guarantees

**How:**
- 0G Compute currently supports **fine-tuning** (LoRA adapters on Qwen models) and **inference**
- Full custom training is listed as "in development"
- For now: use fine-tuning API for supported models, local training for custom models
- TEE attestation on compute results provides integrity verification

**SDK:** `@0glabs/0g-serving-broker`

**Decision logic in client:**
```
if (localGPUAvailable && modelFitsInMemory) {
  trainLocally()
} else if (modelSupported by 0G Compute) {
  trainVia0GCompute()  // TEE-verified
} else {
  trainLocally()  // CPU fallback
}
```

### 4. Federated Learning Client Library

**Core module:** `lib/fl-client.ts`

Responsibilities:
- Download global model from 0G Storage
- Run local training (or dispatch to 0G Compute)
- Compute gradient updates (delta between local model and global model)
- Upload updates to 0G Storage
- Submit Merkle root on-chain
- Listen for round completion events

**Aggregation (FedAvg):**
```
global_model = (1/n) * sum(participant_updates)
```

The aggregator role can be:
- A designated node (simpler, centralized trust)
- Rotated via VRF on-chain (decentralized, more complex)
- Run inside TEE for verified aggregation

### 5. API Routes (Next.js Backend)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/tasks` | GET | List all FL tasks |
| `/api/tasks` | POST | Create new FL task |
| `/api/tasks/[id]` | GET | Get task details + current round |
| `/api/tasks/[id]/register` | POST | Register as participant |
| `/api/tasks/[id]/model` | GET | Get current global model (returns 0G Storage download info) |
| `/api/tasks/[id]/submit` | POST | Submit model update |
| `/api/tasks/[id]/aggregate` | POST | Trigger aggregation |
| `/api/compute/check` | GET | Check 0G Compute availability for a given model |

### 6. Frontend Dashboard

**Pages:**

- **`/` (Home)** - Overview of active FL tasks, network stats
- **`/tasks/create`** - Form to create a new FL task (model config, rounds, rewards)
- **`/tasks/[id]`** - Task detail page showing:
  - Current round number and status
  - Registered participants
  - Submitted updates this round
  - Global model accuracy over time (chart)
  - Download current model button
- **`/participate`** - Participant view:
  - Join a task
  - Train locally or via 0G Compute
  - Submit update
  - View rewards earned

---

## File Structure

```
0g/
├── contracts/
│   ├── FederatedLearning.sol      # Core FL coordination
│   └── PrivTrainINFT.sol          # ERC-7857 model NFT
├── lib/
│   ├── storage.ts                 # 0G Storage upload/download helpers
│   ├── compute.ts                 # 0G Compute integration
│   ├── contracts.ts               # Smart contract interaction (ethers.js)
│   ├── fl-client.ts               # Federated learning client logic
│   ├── aggregator.ts              # FedAvg aggregation logic
│   └── config.ts                  # Chain config, contract addresses, constants
├── types/
│   └── index.ts                   # TypeScript types (Task, Round, Update, etc.)
├── pages/
│   ├── index.tsx                  # Dashboard home
│   ├── tasks/
│   │   ├── create.tsx             # Create FL task
│   │   └── [id].tsx               # Task detail
│   ├── participate.tsx            # Participant view
│   └── api/
│       ├── tasks/
│       │   ├── index.ts           # List/create tasks
│       │   └── [id]/
│       │       ├── index.ts       # Task details
│       │       ├── register.ts    # Register participant
│       │       ├── model.ts       # Get current model
│       │       ├── submit.ts      # Submit update
│       │       └── aggregate.ts   # Trigger aggregation
│       └── compute/
│           └── check.ts           # Check compute availability
├── styles/
│   └── globals.css
└── plan.md                        # This file
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@0gfoundation/0g-ts-sdk` | 0G Storage upload/download (already installed) |
| `ethers` v6 | Blockchain interaction (already installed) |
| `@0glabs/0g-serving-broker` | 0G Compute marketplace SDK |
| `onnxruntime-web` or `@tensorflow/tfjs` | Client-side model training/inference |

---

## Implementation Order

### Phase 1: Core Infrastructure
1. Define TypeScript types (`types/index.ts`)
2. Write `FederatedLearning.sol` smart contract
3. Build `lib/config.ts` with chain/contract config
4. Build `lib/storage.ts` - 0G Storage helpers
5. Build `lib/contracts.ts` - contract interaction

### Phase 2: FL Logic
6. Build `lib/fl-client.ts` - local training + update submission
7. Build `lib/aggregator.ts` - FedAvg aggregation
8. Build `lib/compute.ts` - 0G Compute fallback

### Phase 3: API + Frontend
9. Create API routes
10. Build dashboard pages
11. Wire up wallet connection (MetaMask / 0G wallet)

### Phase 4: INFT + Polish
12. Write `PrivTrainINFT.sol` (ERC-7857)
13. Add model minting flow
14. Add reward claiming UI

---

## Key Design Decisions

### Why 0G Storage over IPFS?
- Native Merkle root verification (tamper-proof by design)
- 200 MB/s retrieval vs IPFS's variable performance
- KV layer allows mutable global model state
- Integrated with 0G Chain for on-chain verification

### Why optional 0G Compute instead of mandatory?
- Full custom training not yet GA on 0G Compute
- Many participants have local GPUs
- Keeps the framework flexible - works today with local training, scales with 0G Compute as it matures

### Why INFT for the final model?
- Model ownership is transferable and tradeable
- Encrypted weights prevent unauthorized access
- Aligns with 0G's INFT ecosystem
- Creates an economic layer on top of collaborative training

### Aggregation trust model
- Phase 1: Designated aggregator (simpler to ship)
- Phase 2: VRF-rotated aggregator with TEE verification (decentralized)

---

## Network Configuration

| Network | Chain ID | RPC |
|---------|----------|-----|
| 0G Testnet (Galileo) | 16602 | `https://evmrpc-testnet.0g.ai` |
| 0G Mainnet | 16661 | `https://evmrpc.0g.ai` |

Development starts on Galileo testnet.
