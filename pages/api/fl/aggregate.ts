import type { NextApiRequest, NextApiResponse } from "next";

interface SerializedModel {
  version: string;
  architecture: string;
  classes: string[];
  baseWeights: number[][];
  headWeights: number[][];
  headShapes: number[][];
  round: number;
  metrics: {
    accuracy: number;
    f1Score: number;
    precision: number;
    recall: number;
    loss: number;
    timestamp: number;
  };
}

/**
 * Federated Averaging (FedAvg) aggregation endpoint.
 * Takes multiple participant model updates and produces a weighted average.
 */
export const config = { api: { bodyParser: { sizeLimit: "50mb" } } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { updates } = req.body as {
      updates: { model: SerializedModel; dataSize: number }[];
    };

    if (!updates || updates.length === 0)
      return res.status(400).json({ error: "No updates provided" });

    // Weighted FedAvg: weight by dataSize
    const totalData = updates.reduce((s, u) => s + u.dataSize, 0);
    const base = updates[0].model;

    const aggregatedWeights: number[][] = base.headWeights.map(
      (layerWeights, layerIdx) => {
        const aggregated = new Array(layerWeights.length).fill(0);
        for (const update of updates) {
          const weight = update.dataSize / totalData;
          const updateLayer = update.model.headWeights[layerIdx];
          for (let i = 0; i < aggregated.length; i++) {
            aggregated[i] += updateLayer[i] * weight;
          }
        }
        return aggregated;
      }
    );

    // Use weighted average of participant metrics
    const avgMetrics = {
      accuracy: 0,
      f1Score: 0,
      precision: 0,
      recall: 0,
      loss: 0,
      timestamp: Date.now(),
    };
    for (const update of updates) {
      const w = update.dataSize / totalData;
      avgMetrics.accuracy += update.model.metrics.accuracy * w;
      avgMetrics.f1Score += update.model.metrics.f1Score * w;
      avgMetrics.precision += update.model.metrics.precision * w;
      avgMetrics.recall += update.model.metrics.recall * w;
      avgMetrics.loss += update.model.metrics.loss * w;
    }

    const aggregatedModel: SerializedModel = {
      ...base,
      headWeights: aggregatedWeights,
      round: Math.max(...updates.map((u) => u.model.round)) + 1,
      metrics: avgMetrics,
    };

    res.json({ success: true, model: aggregatedModel });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
