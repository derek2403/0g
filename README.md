# Zero Training

A decentralized federated learning framework built on **0G** that enables privacy-preserving collaborative model training. Participants train models locally on their own data, submit encrypted weight updates via **0G Storage**, coordinate training rounds through **on-chain smart contracts**, and mint the final trained model as an **ERC-7857 INFT** (Intelligent NFT).

## Demo

**Live:** [https://0g-nine.vercel.app](https://0g-nine.vercel.app)

## How It Works

```
Coordinator creates task  -->  Participants register on-chain
        |                              |
        v                              v
Upload initial model          Upload labeled images
to 0G Storage                 Train locally (MobileNet + TF.js)
        |                              |
        v                              v
On-chain task created         Upload weights to 0G Storage
                              Submit Merkle root on-chain
                                       |
                                       v
                              Coordinator aggregates (FedAvg)
                              New global model uploaded
                              Metrics recorded on-chain
                                       |
                                       v
                              Repeat until final round
                                       |
                                       v
                              Model minted as ERC-7857 INFT
                              Use model / Download (.json, .pkl)
```

## Architecture

| Component | 0G Product | Purpose |
|-----------|-----------|---------|
| Model weight storage | **0G Storage** | Upload/download model weights, gradients, aggregated models via Merkle-root-verified content-addressed storage |
| Training coordination | **0G Chain** | Smart contracts manage task lifecycle, participant registration, round submissions, metrics recording, reward distribution |
| Model ownership | **iNFT (ERC-7857)** | Mint trained models as Intelligent NFTs with encrypted data, usage authorization, and proof-verified transfers |
| GPU marketplace | **0G Compute** | Optional decentralized compute for participants without local GPUs (TEE-verified inference) |

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Wallet:** wagmi, viem, RainbowKit
- **ML:** TensorFlow.js, MobileNet V2 transfer learning (in-browser)
- **Storage:** @0gfoundation/0g-ts-sdk
- **Compute:** @0glabs/0g-serving-broker
- **Contracts:** Solidity 0.8.28, Hardhat 2, OpenZeppelin, ERC-7857

## Smart Contracts

Deployed on **0G Galileo Testnet** (Chain ID: 16602)

| Contract | Address |
|----------|---------|
| MockVerifier | `0xaFBbb476e98AD3BF169d2d4b4B85152774b16C1D` |
| FederatedLearningINFT | `0xc4e07a3716c2bCF814A1D4423C50532ebA71cC54` |

**FederatedLearningINFT** implements:
- **IERC7857** - Intelligent transfer with proof verification via `iTransferFrom`
- **IERC7857Authorize** - Usage authorization (`authorizeUsage`, `revokeAuthorization`)
- **IERC7857Metadata** - `intelligentDatasOf()` for on-chain model references
- **FL coordination** - `createTask`, `register`, `submitUpdate`, `aggregateRound`
- **Reward distribution** - Proportional rewards based on data contribution

## Project Structure

```
├── pages/
│   ├── index.tsx              # Landing page with how-to-use guide
│   ├── create.tsx             # Create a new FL task (custom classes)
│   ├── tasks/index.tsx        # Browse all tasks
│   ├── tasks/[id].tsx         # Task detail + coordinator aggregation panel
│   ├── participate/[id].tsx   # Upload images, train locally, submit update
│   ├── use.tsx                # ChatGPT-like model inference + download
│   ├── demo.tsx               # Quick demo setup (pre-populates a task)
│   └── api/
│       ├── storage/           # 0G Storage upload/download
│       ├── compute/           # 0G Compute inference/setup
│       └── fl/                # FedAvg aggregation, demo setup
├── lib/
│   ├── model.ts               # TF.js model: create, train, serialize, FedAvg, predict
│   ├── fl-contract-abi.ts     # Contract ABI + address
│   ├── wagmi.ts               # Wallet config (0G Galileo testnet)
│   ├── 0g-compute.ts          # Compute broker initialization
│   ├── encrypt.ts             # AES-256-GCM encryption
│   └── config.ts              # RPC, indexer URLs
├── contracts/
│   ├── contracts/
│   │   ├── FederatedLearningINFT.sol   # Main contract (ERC-7857 + FL)
│   │   ├── MockVerifier.sol            # Demo proof verifier
│   │   └── interfaces/                 # ERC-7857 interfaces
│   └── ignition/modules/              # Hardhat Ignition deploy scripts
└── components/
    └── Navbar.tsx
```

## Getting Started

### Prerequisites

- Node.js 18+
- MetaMask with [0G Galileo testnet](https://chainscan-galileo.0g.ai) configured
- 0G testnet tokens from the [faucet](https://faucet.0g.ai)

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

Fill in `.env`:

```env
# Private key for server-side 0G Storage operations
ZG_STORAGE_PRIVATE_KEY=your_private_key_here

# WalletConnect project ID (https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Deployed contract address
NEXT_PUBLIC_FL_CONTRACT_ADDRESS=0xc4e07a3716c2bCF814A1D4423C50532ebA71cC54
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Flow

1. **Pre-setup:** Go to `/demo`, configure task name and classes, click "Setup Demo" (~1 min). This creates a task at round 1/2 with one simulated training round.

2. **Create a task:** Go to `/create` to show live task creation with custom classes.

3. **Participate & train:** Go to `/participate/[taskId]` on the pre-set task:
   - Register as participant (on-chain tx)
   - Upload labeled images (select class per batch)
   - Train locally via MobileNet V2 transfer learning in-browser
   - Submit trained weights to 0G Storage + proof on-chain

4. **Aggregate & mint:** Go to `/tasks/[taskId]` as coordinator:
   - View all submissions
   - Click Aggregate - downloads updates from 0G Storage, runs FedAvg, uploads new model
   - Task completes - ERC-7857 INFT automatically minted

5. **Use the model:** Go to `/use`:
   - Select completed model from sidebar
   - Upload any image - model classifies with confidence scores
   - View INFT details, training metrics history, explorer links
   - Download as `.json` (TF.js) or `.pkl` (Python/NumPy)

### Redeploying Contracts

```bash
cd contracts
npm install
npx hardhat compile
echo "y" | npx hardhat ignition deploy ignition/modules/FederatedLearningINFT.js --network zgTestnet --deployment-id fl-v3
```

Update `NEXT_PUBLIC_FL_CONTRACT_ADDRESS` in `.env` with the new address.

## 0G Products Used

- **0G Storage** - All model weights, gradient updates, and aggregated models stored and retrieved via Merkle-root-verified content-addressed storage
- **0G Chain** - EVM-compatible L1 for smart contract deployment, task coordination, metrics recording, and INFT minting
- **iNFT (ERC-7857)** - Trained models minted as Intelligent NFTs with encrypted data references, usage authorization, and proof-verified transfers
- **0G Compute** - Integrated as optional GPU marketplace for participants without local compute (TEE-verified)
