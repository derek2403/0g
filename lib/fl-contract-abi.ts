// Contract address - update after deploying to 0G Galileo Testnet
export const FL_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_FL_CONTRACT_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

export const FL_CONTRACT_ABI = [
  // ── Task Management ──
  {
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "initialModelRoot", type: "string" },
      { name: "totalRounds", type: "uint256" },
      { name: "minParticipants", type: "uint256" },
    ],
    name: "createTask",
    outputs: [{ name: "taskId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Training Round ──
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "storageRoot", type: "string" },
      { name: "dataSize", type: "uint256" },
    ],
    name: "submitUpdate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "newGlobalModelRoot", type: "string" },
      { name: "accuracy", type: "uint256" },
      { name: "f1Score", type: "uint256" },
      { name: "precision_", type: "uint256" },
      { name: "recall", type: "uint256" },
      { name: "loss", type: "uint256" },
    ],
    name: "aggregateRound",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── INFT ──
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "mintModel",
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── Rewards ──
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "claimReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // ── View Functions ──
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "getTask",
    outputs: [
      {
        components: [
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "globalModelRoot", type: "string" },
          { name: "initialModelRoot", type: "string" },
          { name: "currentRound", type: "uint256" },
          { name: "totalRounds", type: "uint256" },
          { name: "minParticipants", type: "uint256" },
          { name: "rewardPool", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "completed", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "getParticipants",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    name: "getRoundUpdates",
    outputs: [
      {
        components: [
          { name: "participant", type: "address" },
          { name: "storageRoot", type: "string" },
          { name: "dataSize", type: "uint256" },
          { name: "roundId", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "uint256" }],
    name: "getMetricsHistory",
    outputs: [
      {
        components: [
          { name: "accuracy", type: "uint256" },
          { name: "f1Score", type: "uint256" },
          { name: "precision_", type: "uint256" },
          { name: "recall", type: "uint256" },
          { name: "loss", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "roundId", type: "uint256" },
    ],
    name: "getRoundUpdateCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    name: "getContribution",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "getTokenData",
    outputs: [
      {
        components: [
          { name: "dataDescription", type: "string" },
          { name: "dataHash", type: "bytes32" },
        ],
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalMinted",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextTaskId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "taskId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    name: "isParticipant",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // ── Events ──
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "creator", type: "address" },
    ],
    name: "TaskCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "participant", type: "address" },
    ],
    name: "ParticipantRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "roundId", type: "uint256" },
      { indexed: false, name: "participant", type: "address" },
      { indexed: false, name: "storageRoot", type: "string" },
    ],
    name: "UpdateSubmitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "roundId", type: "uint256" },
      { indexed: false, name: "newGlobalModelRoot", type: "string" },
    ],
    name: "RoundAggregated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "roundId", type: "uint256" },
      { indexed: false, name: "accuracy", type: "uint256" },
      { indexed: false, name: "f1Score", type: "uint256" },
    ],
    name: "MetricsRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "tokenId", type: "uint256" },
    ],
    name: "TaskCompleted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "tokenId", type: "uint256" },
      { indexed: true, name: "taskId", type: "uint256" },
      { indexed: false, name: "owner", type: "address" },
    ],
    name: "ModelMinted",
    type: "event",
  },
] as const;
