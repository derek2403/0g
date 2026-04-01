import * as tf from "@tensorflow/tfjs";
import * as mobilenetModule from "@tensorflow-models/mobilenet";

export const IMAGE_SIZE = 224; // MobileNet input size
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
export const NUM_CLASSES = ANIMAL_CLASSES.length;

export interface ModelMetrics {
  accuracy: number;
  f1Score: number;
  precision: number;
  recall: number;
  loss: number;
  timestamp: number;
}

export interface SerializedModel {
  version: string;
  architecture: string;
  classes: string[];
  baseWeights: number[][]; // frozen MobileNet features not stored - only head weights
  headWeights: number[][];
  headShapes: number[][];
  round: number;
  metrics: ModelMetrics;
}

// ─── Create a transfer-learning model on top of MobileNet ───
// We load MobileNet via @tensorflow-models/mobilenet, use .infer(img, true)
// for 1280-dim embedding extraction, then train a classification head.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mobilenet: any = null;
const FEATURE_DIM = 1280; // mobilenet v2 alpha=1.0 .infer(img, embedding=true) output dim

async function getMobilenet() {
  if (mobilenet) return mobilenet;
  mobilenet = await mobilenetModule.load({ version: 2, alpha: 1.0 });
  return mobilenet;
}

export async function createModel(): Promise<tf.LayersModel> {
  const input = tf.input({ shape: [FEATURE_DIM] });
  let x = tf.layers.dense({ units: 128, activation: "relu" }).apply(input) as tf.SymbolicTensor;
  x = tf.layers.dropout({ rate: 0.3 }).apply(x) as tf.SymbolicTensor;
  const output = tf.layers
    .dense({ units: NUM_CLASSES, activation: "softmax" })
    .apply(x) as tf.SymbolicTensor;

  const head = tf.model({ inputs: input, outputs: output });
  head.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });
  return head;
}

// ─── Extract features from images using MobileNet ───
export async function extractFeatures(
  images: HTMLImageElement[] | ImageData[]
): Promise<tf.Tensor2D> {
  const net = await getMobilenet();
  const features: tf.Tensor2D[] = [];
  for (const img of images) {
    // .infer with embedding=true returns a 1024-dim feature vector
    const embedding = net.infer(img, true) as tf.Tensor2D;
    features.push(embedding);
  }
  const stacked = tf.concat(features, 0) as tf.Tensor2D;
  features.forEach((f) => f.dispose());
  return stacked;
}

// ─── Train the head model on extracted features ───
export async function trainOnFeatures(
  head: tf.LayersModel,
  features: tf.Tensor2D,
  labels: number[],
  epochs: number = 10,
  onEpochEnd?: (epoch: number, logs: tf.Logs | undefined) => void
): Promise<tf.History> {
  const oneHot = tf.oneHot(tf.tensor1d(labels, "int32"), NUM_CLASSES);
  const history = await head.fit(features, oneHot, {
    epochs,
    batchSize: 16,
    validationSplit: 0.2,
    shuffle: true,
    callbacks: onEpochEnd ? { onEpochEnd } : undefined,
  });
  oneHot.dispose();
  return history;
}

// ─── Predict on a single image ───
export async function predict(
  head: tf.LayersModel,
  image: HTMLImageElement | ImageData
): Promise<{ class: string; confidence: number; all: { class: string; confidence: number }[] }> {
  const features = await extractFeatures([image] as HTMLImageElement[]);
  const probs = (head.predict(features) as tf.Tensor2D).dataSync();
  features.dispose();

  const all = ANIMAL_CLASSES.map((cls, i) => ({
    class: cls,
    confidence: probs[i],
  })).sort((a, b) => b.confidence - a.confidence);

  return { class: all[0].class, confidence: all[0].confidence, all };
}

// ─── Evaluate model and compute metrics ───
export async function evaluateModel(
  head: tf.LayersModel,
  features: tf.Tensor2D,
  labels: number[]
): Promise<ModelMetrics> {
  const oneHot = tf.oneHot(tf.tensor1d(labels, "int32"), NUM_CLASSES);
  const evalResult = head.evaluate(features, oneHot) as tf.Scalar[];
  const loss = (await evalResult[0].data())[0];
  const accuracy = (await evalResult[1].data())[0];
  oneHot.dispose();

  // Compute per-class precision, recall, F1
  const predictions = (head.predict(features) as tf.Tensor2D).argMax(1);
  const preds = await predictions.data();
  predictions.dispose();

  const tp = new Array(NUM_CLASSES).fill(0);
  const fp = new Array(NUM_CLASSES).fill(0);
  const fn = new Array(NUM_CLASSES).fill(0);

  for (let i = 0; i < labels.length; i++) {
    if (preds[i] === labels[i]) {
      tp[labels[i]]++;
    } else {
      fp[preds[i]]++;
      fn[labels[i]]++;
    }
  }

  let precSum = 0, recSum = 0, f1Sum = 0;
  let classesWithData = 0;
  for (let c = 0; c < NUM_CLASSES; c++) {
    if (tp[c] + fp[c] + fn[c] === 0) continue;
    classesWithData++;
    const p = tp[c] + fp[c] > 0 ? tp[c] / (tp[c] + fp[c]) : 0;
    const r = tp[c] + fn[c] > 0 ? tp[c] / (tp[c] + fn[c]) : 0;
    precSum += p;
    recSum += r;
    f1Sum += p + r > 0 ? (2 * p * r) / (p + r) : 0;
  }

  const div = classesWithData || 1;
  return {
    accuracy,
    f1Score: f1Sum / div,
    precision: precSum / div,
    recall: recSum / div,
    loss,
    timestamp: Date.now(),
  };
}

// ─── Serialize model head weights ───
export async function serializeHead(
  head: tf.LayersModel,
  round: number,
  metrics: ModelMetrics
): Promise<SerializedModel> {
  const headWeights: number[][] = [];
  const headShapes: number[][] = [];
  for (const w of head.getWeights()) {
    headWeights.push(Array.from(await w.data()));
    headShapes.push(w.shape);
  }
  return {
    version: "1.0.0",
    architecture: "mobilenet-v2-head-128-10",
    classes: [...ANIMAL_CLASSES],
    baseWeights: [], // base is frozen + loaded from CDN, no need to store
    headWeights,
    headShapes,
    round,
    metrics,
  };
}

// ─── Deserialize model head weights ───
export async function deserializeHead(
  data: SerializedModel
): Promise<tf.LayersModel> {
  const head = await createModel();
  const tensors = data.headWeights.map((w, i) =>
    tf.tensor(w, data.headShapes[i])
  );
  head.setWeights(tensors);
  tensors.forEach((t) => t.dispose());
  return head;
}

// ─── FedAvg: average multiple serialized models ───
export function fedAvg(
  updates: { model: SerializedModel; dataSize: number }[]
): SerializedModel {
  const totalData = updates.reduce((s, u) => s + u.dataSize, 0);
  const base = updates[0].model;

  const avgWeights: number[][] = base.headWeights.map((layer, layerIdx) => {
    const avg = new Array(layer.length).fill(0);
    for (const update of updates) {
      const weight = update.dataSize / totalData;
      const ul = update.model.headWeights[layerIdx];
      for (let i = 0; i < avg.length; i++) {
        avg[i] += ul[i] * weight;
      }
    }
    return avg;
  });

  return {
    ...base,
    headWeights: avgWeights,
    round: Math.max(...updates.map((u) => u.model.round)) + 1,
    metrics: { accuracy: 0, f1Score: 0, precision: 0, recall: 0, loss: 0, timestamp: Date.now() },
  };
}

// ─── Convert to downloadable formats ───

/** Download as JSON (TF.js compatible weights) */
export function downloadAsJSON(model: SerializedModel, filename: string = "model.json") {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download as .pkl (Python pickle-compatible via JSON wrapper for numpy reconstruction) */
export function downloadAsPKL(model: SerializedModel, filename: string = "model.pkl") {
  // We create a Python-loadable format: a JSON file with .pkl extension
  // that includes a Python reconstruction script header
  const pythonLoader = `# PrivTrain Federated Learning Model
# Load with: import json, numpy as np
# data = json.loads(open("${filename}").read().split("\\n---DATA---\\n")[1])
# weights = [np.array(w).reshape(s) for w, s in zip(data["headWeights"], data["headShapes"])]
---DATA---
`;
  const blob = new Blob(
    [pythonLoader, JSON.stringify({
      version: model.version,
      architecture: model.architecture,
      classes: model.classes,
      headWeights: model.headWeights,
      headShapes: model.headShapes,
      round: model.round,
      metrics: model.metrics,
    }, null, 2)],
    { type: "application/octet-stream" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Load image from file into HTMLImageElement ───
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
