import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import { ANIMAL_CLASSES } from "@/types";
import type { ModelMetrics, SerializedModel } from "@/types";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ─── Simple neural network for animal classification (in-browser) ───
// This simulates a small NN that classifies 16-dim feature vectors into 10 animal classes.
// In a real system you'd use TensorFlow.js; here we use raw math to avoid heavy deps.

const INPUT_DIM = 16;
const HIDDEN_DIM = 32;
const OUTPUT_DIM = ANIMAL_CLASSES.length; // 10

function randomWeights(rows: number, cols: number): number[] {
  const w: number[] = [];
  const scale = Math.sqrt(2 / rows);
  for (let i = 0; i < rows * cols; i++) {
    w.push((Math.random() * 2 - 1) * scale);
  }
  return w;
}

function createInitialModel(): SerializedModel {
  return {
    version: "1.0.0",
    architecture: "mlp-16-32-10",
    classes: [...ANIMAL_CLASSES],
    weights: [
      randomWeights(INPUT_DIM, HIDDEN_DIM), // W1: 16x32
      new Array(HIDDEN_DIM).fill(0),         // b1: 32
      randomWeights(HIDDEN_DIM, OUTPUT_DIM), // W2: 32x10
      new Array(OUTPUT_DIM).fill(0),          // b2: 10
    ],
    shapes: [
      [INPUT_DIM, HIDDEN_DIM],
      [HIDDEN_DIM],
      [HIDDEN_DIM, OUTPUT_DIM],
      [OUTPUT_DIM],
    ],
    round: 0,
    metrics: { accuracy: 0, f1Score: 0, precision: 0, recall: 0, loss: 999, timestamp: Date.now() },
  };
}

// Simple forward pass
function relu(x: number): number { return Math.max(0, x); }

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function forward(model: SerializedModel, input: number[]): number[] {
  const [w1, b1, w2, b2] = model.weights;
  // Hidden layer: ReLU(input @ W1 + b1)
  const hidden: number[] = [];
  for (let j = 0; j < HIDDEN_DIM; j++) {
    let sum = b1[j];
    for (let i = 0; i < INPUT_DIM; i++) {
      sum += input[i] * w1[i * HIDDEN_DIM + j];
    }
    hidden.push(relu(sum));
  }
  // Output layer: softmax(hidden @ W2 + b2)
  const logits: number[] = [];
  for (let j = 0; j < OUTPUT_DIM; j++) {
    let sum = b2[j];
    for (let i = 0; i < HIDDEN_DIM; i++) {
      sum += hidden[i] * w2[i * OUTPUT_DIM + j];
    }
    logits.push(sum);
  }
  return softmax(logits);
}

// Generate synthetic animal feature data
function generateTrainingData(numSamples: number): { inputs: number[][]; labels: number[] } {
  const inputs: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    const label = Math.floor(Math.random() * OUTPUT_DIM);
    // Features: base pattern per class + noise
    const input: number[] = [];
    for (let f = 0; f < INPUT_DIM; f++) {
      const signal = (f % OUTPUT_DIM === label) ? 1.5 : -0.2;
      input.push(signal + (Math.random() - 0.5) * 0.5);
    }
    inputs.push(input);
    labels.push(label);
  }
  return { inputs, labels };
}

// Train one epoch with SGD, return updated weights
function trainEpoch(
  model: SerializedModel,
  inputs: number[][],
  labels: number[],
  lr: number = 0.01
): SerializedModel {
  // Clone weights
  const w1 = [...model.weights[0]];
  const b1 = [...model.weights[1]];
  const w2 = [...model.weights[2]];
  const b2 = [...model.weights[3]];

  for (let s = 0; s < inputs.length; s++) {
    const x = inputs[s];
    const y = labels[s];

    // Forward
    const hidden: number[] = [];
    const hiddenRaw: number[] = [];
    for (let j = 0; j < HIDDEN_DIM; j++) {
      let sum = b1[j];
      for (let i = 0; i < INPUT_DIM; i++) sum += x[i] * w1[i * HIDDEN_DIM + j];
      hiddenRaw.push(sum);
      hidden.push(relu(sum));
    }
    const logits: number[] = [];
    for (let j = 0; j < OUTPUT_DIM; j++) {
      let sum = b2[j];
      for (let i = 0; i < HIDDEN_DIM; i++) sum += hidden[i] * w2[i * OUTPUT_DIM + j];
      logits.push(sum);
    }
    const probs = softmax(logits);

    // Backward: cross-entropy loss gradient
    const dLogits = [...probs];
    dLogits[y] -= 1; // dL/dlogit = prob - one_hot

    // Gradient for W2, b2
    for (let j = 0; j < OUTPUT_DIM; j++) {
      b2[j] -= lr * dLogits[j];
      for (let i = 0; i < HIDDEN_DIM; i++) {
        w2[i * OUTPUT_DIM + j] -= lr * hidden[i] * dLogits[j];
      }
    }

    // Gradient for hidden
    const dHidden: number[] = new Array(HIDDEN_DIM).fill(0);
    for (let i = 0; i < HIDDEN_DIM; i++) {
      for (let j = 0; j < OUTPUT_DIM; j++) {
        dHidden[i] += w2[i * OUTPUT_DIM + j] * dLogits[j];
      }
      if (hiddenRaw[i] <= 0) dHidden[i] = 0; // ReLU gradient
    }

    // Gradient for W1, b1
    for (let j = 0; j < HIDDEN_DIM; j++) {
      b1[j] -= lr * dHidden[j];
      for (let i = 0; i < INPUT_DIM; i++) {
        w1[i * HIDDEN_DIM + j] -= lr * x[i] * dHidden[j];
      }
    }
  }

  return { ...model, weights: [w1, b1, w2, b2] };
}

// Evaluate model and compute metrics
function evaluate(model: SerializedModel, inputs: number[][], labels: number[]): ModelMetrics {
  let correct = 0;
  let totalLoss = 0;
  // Per-class TP, FP, FN
  const tp = new Array(OUTPUT_DIM).fill(0);
  const fp = new Array(OUTPUT_DIM).fill(0);
  const fn = new Array(OUTPUT_DIM).fill(0);

  for (let i = 0; i < inputs.length; i++) {
    const probs = forward(model, inputs[i]);
    const pred = probs.indexOf(Math.max(...probs));
    const loss = -Math.log(Math.max(probs[labels[i]], 1e-10));
    totalLoss += loss;

    if (pred === labels[i]) {
      correct++;
      tp[labels[i]]++;
    } else {
      fp[pred]++;
      fn[labels[i]]++;
    }
  }

  const accuracy = correct / inputs.length;
  // Macro-averaged precision, recall, F1
  let precSum = 0, recSum = 0, f1Sum = 0;
  for (let c = 0; c < OUTPUT_DIM; c++) {
    const p = tp[c] + fp[c] > 0 ? tp[c] / (tp[c] + fp[c]) : 0;
    const r = tp[c] + fn[c] > 0 ? tp[c] / (tp[c] + fn[c]) : 0;
    precSum += p;
    recSum += r;
    f1Sum += p + r > 0 ? (2 * p * r) / (p + r) : 0;
  }

  return {
    accuracy,
    f1Score: f1Sum / OUTPUT_DIM,
    precision: precSum / OUTPUT_DIM,
    recall: recSum / OUTPUT_DIM,
    loss: totalLoss / inputs.length,
    timestamp: Date.now(),
  };
}

// ─── Metrics display component ───
function MetricsCard({ title, metrics }: { title: string; metrics: ModelMetrics }) {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h4 className="font-semibold mb-4 text-gray-300">{title}</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Accuracy</span>
          <div className="text-xl font-bold text-green-400">{pct(metrics.accuracy)}</div>
        </div>
        <div>
          <span className="text-gray-500">F1 Score</span>
          <div className="text-xl font-bold text-blue-400">{pct(metrics.f1Score)}</div>
        </div>
        <div>
          <span className="text-gray-500">Precision</span>
          <div className="text-xl font-bold text-yellow-400">{pct(metrics.precision)}</div>
        </div>
        <div>
          <span className="text-gray-500">Recall</span>
          <div className="text-xl font-bold text-purple-400">{pct(metrics.recall)}</div>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Loss</span>
          <div className="text-xl font-bold text-red-400">{metrics.loss.toFixed(4)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar for metrics over rounds ───
function MetricsChart({ history }: { history: ModelMetrics[] }) {
  if (history.length === 0) return null;
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h4 className="font-semibold mb-4 text-gray-300">Training Progress</h4>
      <div className="space-y-3">
        {history.map((m, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 w-20">Round {i}</span>
            <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
              <div
                className="bg-green-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${m.accuracy * 100}%` }}
              />
            </div>
            <span className="text-green-400 w-16 text-right">
              {(m.accuracy * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DemoStep = "init" | "create" | "training" | "uploading" | "aggregating" | "complete";

export default function Demo() {
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // State
  const [step, setStep] = useState<DemoStep>("init");
  const [globalModel, setGlobalModel] = useState<SerializedModel | null>(null);
  const [initialMetrics, setInitialMetrics] = useState<ModelMetrics | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<ModelMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<ModelMetrics[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds] = useState(5);
  const [logs, setLogs] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [modelRootHash, setModelRootHash] = useState<string>("");
  const [taskId, setTaskId] = useState<number | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<string>("");

  // Contract writes
  const { writeContract: createTask, data: createTxHash } = useWriteContract();
  const { writeContract: submitUpdate } = useWriteContract();
  const { writeContract: aggregateRound, data: aggregateTxHash } = useWriteContract();
  const { isSuccess: createConfirmed } = useWaitForTransactionReceipt({ hash: createTxHash });
  const { isSuccess: aggregateConfirmed } = useWaitForTransactionReceipt({ hash: aggregateTxHash });

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Step 1: Initialize model and show baseline metrics
  const handleInitialize = useCallback(() => {
    const model = createInitialModel();
    setGlobalModel(model);

    // Evaluate on test data
    const { inputs, labels } = generateTrainingData(200);
    const metrics = evaluate(model, inputs, labels);
    setInitialMetrics(metrics);
    setCurrentMetrics(metrics);
    setMetricsHistory([metrics]);

    addLog("Created initial MLP model (16->32->10) for animal classification");
    addLog(`Baseline accuracy: ${(metrics.accuracy * 100).toFixed(2)}% (random ~10%)`);
    setStep("create");
  }, [addLog]);

  // Step 2: Upload initial model to 0G Storage & create on-chain task
  const handleCreateTask = useCallback(async () => {
    if (!globalModel) return;

    addLog("Uploading initial model to 0G Storage...");
    try {
      const resp = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(globalModel) }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);

      setModelRootHash(data.rootHash);
      addLog(`Model uploaded to 0G Storage. Root: ${data.rootHash.slice(0, 16)}...`);

      // Create on-chain task
      addLog("Creating FL task on-chain...");
      createTask({
        address: FL_CONTRACT_ADDRESS as `0x${string}`,
        abi: FL_CONTRACT_ABI,
        functionName: "createTask",
        args: [
          "Animal Classifier FL",
          "Federated learning for 10-class animal classification",
          data.rootHash,
          BigInt(totalRounds),
          BigInt(1), // min 1 participant for demo
        ],
      });
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    }
  }, [globalModel, addLog, createTask, totalRounds]);

  // When task creation is confirmed
  useEffect(() => {
    if (createConfirmed && step === "create") {
      setTaskId(0); // In a real app, parse from event logs
      addLog("FL task created on-chain! Task ID: 0");
      setStep("training");
    }
  }, [createConfirmed, step, addLog]);

  // Step 3: Run federated training rounds
  const handleTrainRound = useCallback(async () => {
    if (!globalModel || isTraining) return;
    setIsTraining(true);

    const round = currentRound;
    addLog(`--- Round ${round + 1}/${totalRounds} ---`);

    // Simulate 3 participants training locally
    const numParticipants = 3;
    const participantModels: { model: SerializedModel; dataSize: number }[] = [];

    for (let p = 0; p < numParticipants; p++) {
      addLog(`Participant ${p + 1}: training locally on private data...`);
      const { inputs, labels } = generateTrainingData(100 + Math.floor(Math.random() * 100));
      let localModel = { ...globalModel };
      // Train for a few epochs
      for (let epoch = 0; epoch < 3; epoch++) {
        localModel = trainEpoch(localModel, inputs, labels, 0.005);
      }
      participantModels.push({ model: localModel, dataSize: inputs.length });
      addLog(`Participant ${p + 1}: trained on ${inputs.length} samples`);
    }

    // Upload each participant's update to 0G Storage
    addLog("Uploading participant updates to 0G Storage...");
    const uploadedRoots: string[] = [];
    for (let p = 0; p < participantModels.length; p++) {
      try {
        const resp = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: JSON.stringify(participantModels[p].model) }),
        });
        const data = await resp.json();
        if (data.success) {
          uploadedRoots.push(data.rootHash);
          addLog(`Participant ${p + 1} update stored: ${data.rootHash.slice(0, 16)}...`);

          // Submit on-chain
          submitUpdate({
            address: FL_CONTRACT_ADDRESS as `0x${string}`,
            abi: FL_CONTRACT_ABI,
            functionName: "submitUpdate",
            args: [BigInt(taskId || 0), data.rootHash, BigInt(participantModels[p].dataSize)],
          });
        }
      } catch {
        addLog(`Participant ${p + 1} upload failed (continuing...)`);
      }
    }

    // FedAvg aggregation
    addLog("Running FedAvg aggregation...");
    try {
      const aggResp = await fetch("/api/fl/aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: participantModels, globalModel }),
      });
      const aggData = await aggResp.json();
      if (!aggData.success) throw new Error(aggData.error);

      const newModel: SerializedModel = aggData.model;

      // Evaluate aggregated model
      const { inputs: testInputs, labels: testLabels } = generateTrainingData(300);
      const metrics = evaluate(newModel, testInputs, testLabels);
      newModel.metrics = metrics;
      newModel.round = round + 1;

      // Upload aggregated model
      const uploadResp = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(newModel) }),
      });
      const uploadData = await uploadResp.json();

      if (uploadData.success) {
        setModelRootHash(uploadData.rootHash);
        addLog(`Aggregated model stored: ${uploadData.rootHash.slice(0, 16)}...`);

        // Record on-chain
        aggregateRound({
          address: FL_CONTRACT_ADDRESS as `0x${string}`,
          abi: FL_CONTRACT_ABI,
          functionName: "aggregateRound",
          args: [
            BigInt(taskId || 0),
            uploadData.rootHash,
            BigInt(Math.round(metrics.accuracy * 10000)),
            BigInt(Math.round(metrics.f1Score * 10000)),
            BigInt(Math.round(metrics.precision * 10000)),
            BigInt(Math.round(metrics.recall * 10000)),
            BigInt(Math.round(metrics.loss * 10000)),
          ],
        });
      }

      setGlobalModel(newModel);
      setCurrentMetrics(metrics);
      setMetricsHistory((prev) => [...prev, metrics]);
      setCurrentRound(round + 1);

      addLog(
        `Round ${round + 1} complete: accuracy=${(metrics.accuracy * 100).toFixed(2)}%, ` +
        `F1=${(metrics.f1Score * 100).toFixed(2)}%, loss=${metrics.loss.toFixed(4)}`
      );

      if (round + 1 >= totalRounds) {
        addLog("All rounds complete! Model INFT minted automatically.");
        setStep("complete");
      }
    } catch (err) {
      addLog(`Aggregation error: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    setIsTraining(false);
  }, [globalModel, isTraining, currentRound, totalRounds, addLog, taskId, submitUpdate, aggregateRound]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white">
            &larr;
          </Link>
          <h1 className="text-xl font-bold">Animal Classifier FL Demo</h1>
        </div>
        <ConnectButton />
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!isConnected ? (
          <div className="text-center py-20 text-gray-500">
            Connect your wallet to run the demo
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Controls */}
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Demo Controls</h3>

                <div className="space-y-3">
                  <button
                    onClick={handleInitialize}
                    disabled={step !== "init"}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg transition text-sm"
                  >
                    1. Initialize Model
                  </button>

                  <button
                    onClick={handleCreateTask}
                    disabled={step !== "create"}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg transition text-sm"
                  >
                    2. Upload to 0G & Create Task
                  </button>

                  <button
                    onClick={handleTrainRound}
                    disabled={step !== "training" || isTraining}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg transition text-sm"
                  >
                    {isTraining
                      ? `Training Round ${currentRound + 1}...`
                      : `3. Train Round ${currentRound + 1}/${totalRounds}`}
                  </button>
                </div>

                {/* Status */}
                <div className="mt-4 pt-4 border-t border-gray-800 text-sm text-gray-400">
                  <div>Step: <span className="text-white">{step}</span></div>
                  <div>Round: <span className="text-white">{currentRound}/{totalRounds}</span></div>
                  {modelRootHash && (
                    <div className="mt-1 truncate">
                      Model Root: <span className="text-blue-400 font-mono text-xs">{modelRootHash.slice(0, 20)}...</span>
                    </div>
                  )}
                  {taskId !== null && (
                    <div>Task ID: <span className="text-white">{taskId}</span></div>
                  )}
                  {mintedTokenId && (
                    <div>INFT Token: <span className="text-green-400">{mintedTokenId}</span></div>
                  )}
                </div>
              </div>

              {/* Architecture info */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-sm text-gray-400">
                <h4 className="font-semibold text-gray-300 mb-2">Model Architecture</h4>
                <div>Type: MLP (Multi-Layer Perceptron)</div>
                <div>Input: 16-dim feature vector</div>
                <div>Hidden: 32 neurons (ReLU)</div>
                <div>Output: 10 classes (softmax)</div>
                <div>Classes: {ANIMAL_CLASSES.join(", ")}</div>
                <div className="mt-2">Optimizer: SGD (lr=0.005)</div>
                <div>Aggregation: FedAvg</div>
                <div>Participants: 3 per round</div>
              </div>
            </div>

            {/* Center: Metrics */}
            <div className="space-y-6">
              {initialMetrics && (
                <MetricsCard title="Initial Model (Baseline)" metrics={initialMetrics} />
              )}
              {currentMetrics && currentRound > 0 && (
                <MetricsCard title={`After Round ${currentRound}`} metrics={currentMetrics} />
              )}
              <MetricsChart history={metricsHistory} />

              {step === "complete" && initialMetrics && currentMetrics && (
                <div className="bg-green-900/30 rounded-xl p-6 border border-green-700">
                  <h4 className="font-semibold text-green-400 mb-3">Training Complete!</h4>
                  <div className="text-sm space-y-1">
                    <div>
                      Accuracy: {(initialMetrics.accuracy * 100).toFixed(2)}% &rarr;{" "}
                      <span className="text-green-400 font-bold">
                        {(currentMetrics.accuracy * 100).toFixed(2)}%
                      </span>{" "}
                      (+{((currentMetrics.accuracy - initialMetrics.accuracy) * 100).toFixed(2)}%)
                    </div>
                    <div>
                      F1: {(initialMetrics.f1Score * 100).toFixed(2)}% &rarr;{" "}
                      <span className="text-blue-400 font-bold">
                        {(currentMetrics.f1Score * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      Loss: {initialMetrics.loss.toFixed(4)} &rarr;{" "}
                      <span className="text-red-400 font-bold">
                        {currentMetrics.loss.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-3 text-gray-400">
                      Model minted as INFT with full metrics history on 0G Chain.
                      All model weights stored on 0G Storage.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Logs */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-semibold mb-4">Activity Log</h3>
              <div className="h-[600px] overflow-y-auto font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <div className="text-gray-500">Click &quot;Initialize Model&quot; to start</div>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes("Error")
                          ? "text-red-400"
                          : log.includes("complete")
                            ? "text-green-400"
                            : log.startsWith("[") && log.includes("---")
                              ? "text-yellow-400 font-bold mt-2"
                              : "text-gray-400"
                      }
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
