import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import {
  ANIMAL_CLASSES,
  IMAGE_SIZE,
  createModel,
  extractFeatures,
  trainOnFeatures,
  evaluateModel,
  serializeHead,
  deserializeHead,
  loadImageFromFile,
} from "@/lib/model";
import type { ModelMetrics, SerializedModel } from "@/lib/model";
import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type * as tf from "@tensorflow/tfjs";

interface LabeledImage {
  file: File;
  label: number;
  preview: string;
}

export default function Participate() {
  const router = useRouter();
  const { id } = router.query;
  const taskId = id ? Number(id) : 0;
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Contract reads
  const { data: task } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });
  const { data: isRegistered } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "isParticipant",
    args: [BigInt(taskId), address as `0x${string}`],
  });
  const { data: roundUpdateCount } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getRoundUpdateCount",
    args: [
      BigInt(taskId),
      task ? (task as { currentRound: bigint }).currentRound : BigInt(0),
    ],
  });

  // Contract writes
  const { writeContract: registerTx, data: registerHash } = useWriteContract();
  const { isSuccess: registerConfirmed } = useWaitForTransactionReceipt({ hash: registerHash });
  const { writeContract: submitTx, data: submitHash } = useWriteContract();
  const { isSuccess: submitConfirmed } = useWaitForTransactionReceipt({ hash: submitHash });

  // Local state
  const [images, setImages] = useState<LabeledImage[]>([]);
  const [selectedLabel, setSelectedLabel] = useState(0);
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trainLogs, setTrainLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [hasSubmittedThisRound, setHasSubmittedThisRound] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = task as {
    name: string;
    description: string;
    globalModelRoot: string;
    currentRound: bigint;
    totalRounds: bigint;
    minParticipants: bigint;
    completed: boolean;
  } | undefined;

  const addLog = useCallback((msg: string) => {
    setTrainLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages: LabeledImage[] = files.map((file) => ({
      file,
      label: selectedLabel,
      preview: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Register as participant
  const handleRegister = () => {
    registerTx({
      address: FL_CONTRACT_ADDRESS as `0x${string}`,
      abi: FL_CONTRACT_ABI,
      functionName: "register",
      args: [BigInt(taskId)],
    });
  };

  // Train locally on uploaded images
  const handleTrain = async () => {
    if (images.length < 2) {
      setStatus("Upload at least 2 images to train");
      return;
    }

    setIsTraining(true);
    setTrainingProgress(0);
    addLog("Initializing model...");

    try {
      // Load or create model
      let head: tf.LayersModel;
      if (t?.globalModelRoot && t.globalModelRoot !== "") {
        addLog("Downloading global model from 0G Storage...");
        try {
          const resp = await fetch("/api/storage/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rootHash: t.globalModelRoot }),
          });
          const data = await resp.json();
          if (data.success && data.content) {
            const serialized: SerializedModel = JSON.parse(data.content);
            if (serialized.headWeights.length > 0) {
              head = await deserializeHead(serialized);
              addLog("Loaded global model weights from 0G Storage");
            } else {
              head = await createModel();
              addLog("Global model has no weights yet, using fresh initialization");
            }
          } else {
            head = await createModel();
            addLog("Could not download global model, using fresh initialization");
          }
        } catch {
          head = await createModel();
          addLog("Failed to load global model, using fresh initialization");
        }
      } else {
        head = await createModel();
        addLog("Created fresh model");
      }

      // Extract features from uploaded images
      addLog(`Extracting features from ${images.length} images...`);
      const htmlImages: HTMLImageElement[] = [];
      for (const img of images) {
        const htmlImg = await loadImageFromFile(img.file);
        htmlImages.push(htmlImg);
      }
      const features = await extractFeatures(htmlImages);
      const labels = images.map((img) => img.label);
      addLog("Features extracted via MobileNet");

      // Train
      const epochs = 15;
      addLog(`Training for ${epochs} epochs...`);
      await trainOnFeatures(head, features, labels, epochs, (epoch, logs) => {
        const acc = logs?.acc ?? logs?.accuracy ?? 0;
        const loss = logs?.loss ?? 0;
        setTrainingProgress(((epoch + 1) / epochs) * 100);
        addLog(`Epoch ${epoch + 1}/${epochs} - loss: ${(loss as number).toFixed(4)}, acc: ${(acc as number).toFixed(4)}`);
      });

      // Evaluate
      addLog("Evaluating model...");
      const evalMetrics = await evaluateModel(head, features, labels);
      setMetrics(evalMetrics);
      addLog(
        `Results: accuracy=${(evalMetrics.accuracy * 100).toFixed(1)}%, ` +
        `F1=${(evalMetrics.f1Score * 100).toFixed(1)}%, ` +
        `loss=${evalMetrics.loss.toFixed(4)}`
      );

      features.dispose();
      setModel(head);
      setStatus("Training complete! You can now submit your update.");
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      setStatus("Training failed");
    }
    setIsTraining(false);
  };

  // Submit trained model to 0G Storage + on-chain
  const handleSubmit = async () => {
    if (!model || !metrics) return;
    setIsSubmitting(true);

    try {
      addLog("Serializing model weights...");
      const round = t ? Number(t.currentRound) : 0;
      const serialized = await serializeHead(model, round, metrics);

      addLog("Uploading to 0G Storage...");
      const resp = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(serialized) }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);

      addLog(`Uploaded! Root: ${data.rootHash.slice(0, 20)}...`);
      addLog("Submitting proof on-chain...");

      submitTx({
        address: FL_CONTRACT_ADDRESS as `0x${string}`,
        abi: FL_CONTRACT_ABI,
        functionName: "submitUpdate",
        args: [BigInt(taskId), data.rootHash, BigInt(images.length)],
      });
    } catch (err) {
      addLog(`Submit error: ${err instanceof Error ? err.message : "Unknown"}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (submitConfirmed) {
      addLog("Update submitted on-chain! Waiting for aggregation...");
      setHasSubmittedThisRound(true);
      setIsSubmitting(false);
    }
  }, [submitConfirmed, addLog]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/tasks/${taskId}`} className="text-gray-400 hover:text-white">&larr;</Link>
          <h1 className="text-xl font-bold">Participate in Task #{taskId}</h1>
        </div>
        <ConnectButton />
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!isConnected ? (
          <div className="text-center py-20 text-gray-500">Connect your wallet to participate</div>
        ) : !t ? (
          <div className="text-center py-20 text-gray-500">Loading task...</div>
        ) : t.completed ? (
          <div className="text-center py-20">
            <div className="text-green-400 text-xl mb-4">Task Complete</div>
            <Link href={`/tasks/${taskId}`} className="text-blue-400 underline">View results</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Task Info + Registration */}
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-3">{t.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{t.description}</p>
                <div className="text-sm space-y-1 text-gray-400">
                  <div>Round: <span className="text-white">{t.currentRound.toString()}/{t.totalRounds.toString()}</span></div>
                  <div>Min Participants: <span className="text-white">{t.minParticipants.toString()}</span></div>
                  <div>Submissions this round: <span className="text-white">{roundUpdateCount?.toString() || "0"}</span></div>
                </div>

                {!isRegistered ? (
                  <button
                    onClick={handleRegister}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                  >
                    {registerHash ? "Registering..." : "Register as Participant"}
                  </button>
                ) : (
                  <div className="mt-4 text-green-400 text-sm font-medium">
                    Registered
                  </div>
                )}
                {registerConfirmed && (
                  <div className="mt-2 text-green-400 text-xs">Registration confirmed!</div>
                )}
              </div>

              {/* Image upload */}
              {(isRegistered || registerConfirmed) && (
                <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 className="font-semibold mb-3">Upload Training Images</h3>
                  <div className="mb-3">
                    <label className="block text-sm text-gray-400 mb-1">Label for next upload</label>
                    <select
                      value={selectedLabel}
                      onChange={(e) => setSelectedLabel(Number(e.target.value))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                    >
                      {ANIMAL_CLASSES.map((cls, i) => (
                        <option key={cls} value={i}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 border-dashed px-4 py-3 rounded-lg text-sm transition"
                  >
                    + Upload Images ({images.length} uploaded)
                  </button>

                  {/* Image grid */}
                  {images.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                      {images.map((img, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={img.preview}
                            alt={ANIMAL_CLASSES[img.label]}
                            className="w-full h-16 object-cover rounded"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-xs text-center py-0.5 rounded-b">
                            {ANIMAL_CLASSES[img.label]}
                          </div>
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute top-0 right-0 bg-red-600 text-white text-xs w-4 h-4 rounded-full opacity-0 group-hover:opacity-100 transition"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary per class */}
                  {images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {ANIMAL_CLASSES.map((cls, i) => {
                        const count = images.filter((img) => img.label === i).length;
                        if (count === 0) return null;
                        return (
                          <span key={cls} className="text-xs bg-gray-800 px-2 py-1 rounded">
                            {cls}: {count}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Center: Training + Metrics */}
            <div className="space-y-6">
              {(isRegistered || registerConfirmed) && (
                <>
                  {/* Train button */}
                  <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                    <h3 className="font-semibold mb-3">Local Training</h3>
                    <button
                      onClick={handleTrain}
                      disabled={isTraining || images.length < 2 || hasSubmittedThisRound}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-3 rounded-lg font-semibold transition"
                    >
                      {isTraining
                        ? `Training... ${trainingProgress.toFixed(0)}%`
                        : hasSubmittedThisRound
                          ? "Already submitted this round"
                          : `Train on ${images.length} images`}
                    </button>

                    {isTraining && (
                      <div className="mt-3 bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-300"
                          style={{ width: `${trainingProgress}%` }}
                        />
                      </div>
                    )}

                    {model && !isTraining && !hasSubmittedThisRound && (
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-3 rounded-lg font-semibold transition"
                      >
                        {isSubmitting ? "Submitting..." : "Submit Update to 0G Storage + On-Chain"}
                      </button>
                    )}

                    {status && (
                      <div className="mt-3 text-sm text-gray-400">{status}</div>
                    )}
                  </div>

                  {/* Metrics */}
                  {metrics && (
                    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                      <h3 className="font-semibold mb-4">Your Local Model Metrics</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500">Accuracy</span>
                          <div className="text-xl font-bold text-green-400">
                            {(metrics.accuracy * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">F1 Score</span>
                          <div className="text-xl font-bold text-blue-400">
                            {(metrics.f1Score * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Precision</span>
                          <div className="text-xl font-bold text-yellow-400">
                            {(metrics.precision * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Recall</span>
                          <div className="text-xl font-bold text-purple-400">
                            {(metrics.recall * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-500">Loss</span>
                          <div className="text-xl font-bold text-red-400">
                            {metrics.loss.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right: Logs */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-semibold mb-4">Training Log</h3>
              <div className="h-[500px] overflow-y-auto font-mono text-xs space-y-1">
                {trainLogs.length === 0 ? (
                  <div className="text-gray-500">
                    Upload images and click Train to start
                  </div>
                ) : (
                  trainLogs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes("Error") ? "text-red-400" :
                        log.includes("complete") || log.includes("confirmed") ? "text-green-400" :
                        log.includes("Epoch") ? "text-yellow-400" :
                        "text-gray-400"
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
