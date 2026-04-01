export interface ModelMetrics {
  accuracy: number;
  f1Score: number;
  precision: number;
  recall: number;
  loss: number;
  timestamp: number;
}

export interface FLTask {
  name: string;
  description: string;
  globalModelRoot: string;
  initialModelRoot: string;
  currentRound: number;
  totalRounds: number;
  minParticipants: number;
  rewardPool: bigint;
  creator: string;
  completed: boolean;
  createdAt: number;
}

export interface ParticipantUpdate {
  participant: string;
  storageRoot: string;
  dataSize: number;
  roundId: number;
  timestamp: number;
}

// Animal classes for the demo classifier
export const ANIMAL_CLASSES = [
  "cat",
  "dog",
  "bird",
  "fish",
  "horse",
  "elephant",
  "bear",
  "deer",
  "frog",
  "snake",
] as const;

export type AnimalClass = (typeof ANIMAL_CLASSES)[number];

// Model weights serialization format stored in 0G Storage
export interface SerializedModel {
  version: string;
  architecture: string;
  classes: string[];
  weights: number[][]; // layer weights as flat arrays
  shapes: number[][]; // shape of each weight tensor
  round: number;
  metrics: ModelMetrics;
}
