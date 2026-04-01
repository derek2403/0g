import type { NextApiRequest, NextApiResponse } from "next";
import type { SerializedModel, ModelMetrics } from "@/types";

/**
 * Federated Averaging (FedAvg) aggregation endpoint.
 * Takes multiple participant model updates and produces a weighted average.
 */
export const config = { api: { bodyParser: { sizeLimit: "50mb" } } };

function computeMetrics(weights: number[][]): ModelMetrics {
  // In a real system, you'd evaluate the aggregated model on a validation set.
  // Here we estimate from the weight statistics as a placeholder.
  return {
    accuracy: 0,
    f1Score: 0,
    precision: 0,
    recall: 0,
    loss: 0,
    timestamp: Date.now(),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { updates, globalModel } = req.body as {
      updates: { model: SerializedModel; dataSize: number }[];
      globalModel: SerializedModel;
    };

    if (!updates || updates.length === 0)
      return res.status(400).json({ error: "No updates provided" });

    // Weighted FedAvg: weight by dataSize
    const totalData = updates.reduce((s, u) => s + u.dataSize, 0);

    const aggregatedWeights: number[][] = globalModel.weights.map(
      (layerWeights, layerIdx) => {
        const aggregated = new Array(layerWeights.length).fill(0);
        for (const update of updates) {
          const weight = update.dataSize / totalData;
          const updateLayer = update.model.weights[layerIdx];
          for (let i = 0; i < aggregated.length; i++) {
            aggregated[i] += updateLayer[i] * weight;
          }
        }
        return aggregated;
      }
    );

    const aggregatedModel: SerializedModel = {
      ...globalModel,
      weights: aggregatedWeights,
      round: globalModel.round + 1,
      metrics: computeMetrics(aggregatedWeights),
    };

    res.json({ success: true, model: aggregatedModel });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
