import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { ZG_RPC } from "@/lib/config";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import fs from "fs";
import os from "os";
import path from "path";

const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

// Simulated trained model weights (small random head that improves over rounds)
function generateHeadWeights(round: number) {
  // Dense layer: 1280 -> 128 (weights + bias) + 128 -> 10 (weights + bias)
  const seed = round * 42;
  const rng = (i: number) => Math.sin(seed + i) * 0.5;

  const w1: number[] = [];
  for (let i = 0; i < 1280 * 128; i++) w1.push(rng(i) * 0.1);
  const b1: number[] = new Array(128).fill(0).map((_, i) => rng(i + 200000) * 0.01);
  const w2: number[] = [];
  for (let i = 0; i < 128 * 10; i++) w2.push(rng(i + 300000) * 0.3);
  const b2: number[] = new Array(10).fill(0).map((_, i) => rng(i + 400000) * 0.01);

  return {
    headWeights: [w1, b1, w2, b2],
    headShapes: [[1280, 128], [128], [128, 10], [10]],
  };
}

/**
 * POST /api/fl/demo-setup
 *
 * Creates a task at round 4/5 with pre-populated metrics.
 * The caller's wallet must be the one that sends the on-chain txs.
 * This endpoint only handles the 0G Storage uploads and returns
 * the data needed for the frontend to send the contract calls.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const pk = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!pk) return res.status(500).json({ error: "ZG_STORAGE_PRIVATE_KEY not set" });

  const provider = new ethers.JsonRpcProvider(ZG_RPC);
  const signer = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(FL_CONTRACT_ADDRESS, FL_CONTRACT_ABI, signer);
  const indexer = new Indexer(ZG_INDEXER);

  try {
    const {
      name = "Animal Classifier",
      description = "Pre-trained federated model at round 1/2. One more round to complete!",
      classes = ["cat","dog","bird","fish","horse","elephant","bear","deer","frog","snake"],
      totalRounds = 2,
    } = req.body || {};

    const classesArr = Array.isArray(classes) ? classes : (classes as string).split(",").map((c: string) => c.trim()).filter(Boolean);

    // Simulated metrics for 1 pre-trained round
    const metricsPerRound = [
      { accuracy: 0.45, f1Score: 0.40, precision: 0.42, recall: 0.39, loss: 1.8 },
    ];

    // Step 1: Upload initial model to 0G Storage
    const initialModel = {
      version: "1.0.0",
      architecture: `mobilenet-v2-head-128-${classesArr.length}`,
      classes: classesArr,
      baseWeights: [],
      headWeights: [],
      headShapes: [],
      round: 0,
      metrics: { accuracy: 0, f1Score: 0, precision: 0, recall: 0, loss: 999, timestamp: Date.now() },
    };

    const initialRoot = await uploadModel(indexer, signer, initialModel);

    // Step 2: Create task on-chain
    const createTx = await contract.createTask(
      name,
      description,
      initialRoot,
      BigInt(totalRounds),
      BigInt(1),
    );
    await createTx.wait();

    // Get the task ID
    const taskId = Number(await contract.nextTaskId()) - 1;

    // Step 3: Register the server wallet as participant
    const regTx = await contract.register(BigInt(taskId));
    await regTx.wait();

    // Step 4: Simulate 1 round of training
    let currentModelRoot = initialRoot;
    for (let round = 0; round < 1; round++) {
      const m = metricsPerRound[round];
      const { headWeights, headShapes } = generateHeadWeights(round + 1);

      // Create participant update
      const updateModel = {
        ...initialModel,
        headWeights,
        headShapes,
        round: round + 1,
        metrics: { ...m, timestamp: Date.now() },
      };
      const updateRoot = await uploadModel(indexer, signer, updateModel);

      // Submit update on-chain
      const submitTx = await contract.submitUpdate(
        BigInt(taskId),
        updateRoot,
        BigInt(100 + round * 50), // simulated data size
      );
      await submitTx.wait();

      // Aggregate round (upload new global model)
      const globalModel = { ...updateModel };
      const globalRoot = await uploadModel(indexer, signer, globalModel);

      const aggTx = await contract.aggregateRound(
        BigInt(taskId),
        globalRoot,
        BigInt(Math.round(m.accuracy * 10000)),
        BigInt(Math.round(m.f1Score * 10000)),
        BigInt(Math.round(m.precision * 10000)),
        BigInt(Math.round(m.recall * 10000)),
        BigInt(Math.round(m.loss * 10000)),
      );
      await aggTx.wait();

      currentModelRoot = globalRoot;
    }

    res.json({
      success: true,
      taskId,
      currentRound: 4,
      totalRounds: 5,
      currentModelRoot,
      message: "Demo task created at round 4/5. Go to /participate/" + taskId + " to do the final round!",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

async function uploadModel(
  indexer: Indexer,
  signer: ethers.Wallet,
  model: object
): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `fl-demo-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(model), "utf-8");

  const zgFile = await ZgFile.fromFilePath(tmpFile);
  const [tree, treeErr] = await zgFile.merkleTree();
  if (treeErr || !tree) {
    fs.unlinkSync(tmpFile);
    throw new Error("Failed to build merkle tree");
  }
  const rootHash = tree.rootHash();

  const [, uploadErr] = await indexer.upload(zgFile, ZG_RPC, signer);
  await zgFile.close();
  fs.unlinkSync(tmpFile);

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr}`);
  return rootHash as string;
}
