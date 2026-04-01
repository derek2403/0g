import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import {
  DEFAULT_CLASSES,
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
  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);
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

  const handleRegister = () => {
    registerTx({
      address: FL_CONTRACT_ADDRESS as `0x${string}`,
      abi: FL_CONTRACT_ABI,
      functionName: "register",
      args: [BigInt(taskId)],
    });
  };

  const handleTrain = async () => {
    if (images.length < 2) {
      setStatus("Upload at least 2 images to train");
      return;
    }

    setIsTraining(true);
    setTrainingProgress(0);
    addLog("Initializing model...");

    try {
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
            if (serialized.classes?.length > 0) setClasses(serialized.classes);
            if (serialized.headWeights?.length > 0) {
              head = await deserializeHead(serialized);
              addLog("Loaded global model weights from 0G Storage");
            } else {
              head = await createModel(serialized.classes?.length || classes.length);
              addLog("Global model has no weights yet, using fresh initialization");
            }
          } else {
            head = await createModel(classes.length);
            addLog("Could not download global model, using fresh initialization");
          }
        } catch {
          head = await createModel(classes.length);
          addLog("Failed to load global model, using fresh initialization");
        }
      } else {
        head = await createModel(classes.length);
        addLog("Created fresh model");
      }

      addLog(`Extracting features from ${images.length} images...`);
      const htmlImages: HTMLImageElement[] = [];
      for (const img of images) {
        const htmlImg = await loadImageFromFile(img.file);
        htmlImages.push(htmlImg);
      }
      const features = await extractFeatures(htmlImages);
      const labels = images.map((img) => img.label);
      addLog("Features extracted via MobileNet");

      const epochs = 15;
      addLog(`Training for ${epochs} epochs...`);
      await trainOnFeatures(head, features, labels, classes.length, epochs, (epoch: number, logs: tf.Logs | undefined) => {
        const acc = logs?.acc ?? logs?.accuracy ?? 0;
        const loss = logs?.loss ?? 0;
        setTrainingProgress(((epoch + 1) / epochs) * 100);
        addLog(`Epoch ${epoch + 1}/${epochs} - loss: ${(loss as number).toFixed(4)}, acc: ${(acc as number).toFixed(4)}`);
      });

      addLog("Evaluating model...");
      const evalMetrics = await evaluateModel(head, features, labels, classes.length);
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

  const handleSubmit = async () => {
    if (!model || !metrics) return;
    setIsSubmitting(true);

    try {
      addLog("Serializing model weights...");
      const round = t ? Number(t.currentRound) : 0;
      const serialized = await serializeHead(model, round, metrics, classes);

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
    <div className="min-h-screen bg-gray-50 pt-20">
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Page heading */}
        <div className="mb-8">
          <Link href={`/tasks/${taskId}`} className="text-sm text-gray-400 hover:text-gray-600">&larr; Back to Task</Link>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">Participate in Task #{taskId}</h2>
        </div>

        {!isConnected ? (
          <div className="py-20 text-center text-gray-500">Connect your wallet to participate</div>
        ) : !t ? (
          <div className="py-20 text-center text-gray-500">Loading task...</div>
        ) : t.completed ? (
          <div className="py-20 text-center">
            <div className="mb-4 text-xl font-semibold text-green-600">Task Complete</div>
            <Link href={`/tasks/${taskId}`} className="text-blue-600 underline">View results</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: Task Info + Registration */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="font-semibold text-gray-900">{t.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Round</span>
                    <span className="font-medium text-gray-900">{t.currentRound.toString()}/{t.totalRounds.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Min Participants</span>
                    <span className="font-medium text-gray-900">{t.minParticipants.toString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Submissions</span>
                    <span className="font-medium text-gray-900">{roundUpdateCount?.toString() || "0"}</span>
                  </div>
                </div>

                {!isRegistered ? (
                  <button
                    onClick={handleRegister}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    {registerHash ? "Registering..." : "Register as Participant"}
                  </button>
                ) : (
                  <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Registered
                  </div>
                )}
                {registerConfirmed && (
                  <div className="mt-1 text-xs text-green-600">Registration confirmed!</div>
                )}
              </div>

              {/* Image upload */}
              {(isRegistered || registerConfirmed) && (
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="font-semibold text-gray-900">Upload Training Images</h3>
                  <div className="mt-3">
                    <label className="mb-1 block text-sm text-gray-500">Label for next upload</label>
                    <select
                      value={selectedLabel}
                      onChange={(e) => setSelectedLabel(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                    >
                      {classes.map((cls, i) => (
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
                    className="mt-3 w-full rounded-lg border-2 border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500 transition hover:border-blue-400 hover:text-blue-600"
                  >
                    + Upload Images ({images.length} uploaded)
                  </button>

                  {images.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                      {images.map((img, i) => (
                        <div key={i} className="group relative">
                          <img
                            src={img.preview}
                            alt={classes[img.label]}
                            className="h-16 w-full rounded-lg object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/60 py-0.5 text-center text-[10px] text-white">
                            {classes[img.label]}
                          </div>
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {classes.map((cls, i) => {
                        const count = images.filter((img) => img.label === i).length;
                        if (count === 0) return null;
                        return (
                          <span key={cls} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
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
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <h3 className="font-semibold text-gray-900">Local Training</h3>
                    <button
                      onClick={handleTrain}
                      disabled={isTraining || images.length < 2 || hasSubmittedThisRound}
                      className="mt-3 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      {isTraining
                        ? `Training... ${trainingProgress.toFixed(0)}%`
                        : hasSubmittedThisRound
                          ? "Already submitted this round"
                          : `Train on ${images.length} images`}
                    </button>

                    {isTraining && (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-300"
                          style={{ width: `${trainingProgress}%` }}
                        />
                      </div>
                    )}

                    {model && !isTraining && !hasSubmittedThisRound && (
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                      >
                        {isSubmitting ? "Submitting..." : "Submit Update to 0G Storage + On-Chain"}
                      </button>
                    )}

                    {status && (
                      <div className="mt-3 text-sm text-gray-500">{status}</div>
                    )}
                  </div>

                  {metrics && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <h3 className="mb-4 font-semibold text-gray-900">Your Local Model Metrics</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-400">Accuracy</div>
                          <div className="text-xl font-bold text-green-600">
                            {(metrics.accuracy * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-400">F1 Score</div>
                          <div className="text-xl font-bold text-blue-600">
                            {(metrics.f1Score * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-400">Precision</div>
                          <div className="text-xl font-bold text-amber-600">
                            {(metrics.precision * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-400">Recall</div>
                          <div className="text-xl font-bold text-purple-600">
                            {(metrics.recall * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="col-span-2 rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-400">Loss</div>
                          <div className="text-xl font-bold text-red-500">
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
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="mb-4 font-semibold text-gray-900">Training Log</h3>
              <div className="h-[500px] space-y-1 overflow-y-auto font-mono text-xs">
                {trainLogs.length === 0 ? (
                  <div className="text-gray-400">
                    Upload images and click Train to start
                  </div>
                ) : (
                  trainLogs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes("Error") ? "text-red-500" :
                        log.includes("complete") || log.includes("confirmed") ? "text-green-600" :
                        log.includes("Epoch") ? "text-amber-600" :
                        "text-gray-500"
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
