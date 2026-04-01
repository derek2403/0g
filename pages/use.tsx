import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import {
  ANIMAL_CLASSES,
  createModel,
  deserializeHead,
  extractFeatures,
  loadImageFromFile,
  downloadAsJSON,
  downloadAsPKL,
} from "@/lib/model";
import type { SerializedModel } from "@/lib/model";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type * as tf from "@tensorflow/tfjs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: string;
  predictions?: { class: string; confidence: number }[];
}

export default function UseModel() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [serializedModel, setSerializedModel] = useState<SerializedModel | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState("");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: nextTaskId } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "nextTaskId",
  });

  const taskCount = Number(nextTaskId || 0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadModel = useCallback(async (taskId: number) => {
    setIsLoadingModel(true);
    setModelStatus("Loading task from chain...");
    setMessages([]);

    try {
      setModelStatus("Downloading model from 0G Storage...");
      setSelectedTaskId(taskId);
    } catch (err) {
      setModelStatus(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      setIsLoadingModel(false);
    }
  }, []);

  const { data: selectedTask } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getTask",
    args: selectedTaskId !== null ? [BigInt(selectedTaskId)] : undefined,
  });

  useEffect(() => {
    if (!selectedTask || !isLoadingModel) return;
    const t = selectedTask as { globalModelRoot: string; name: string; completed: boolean };
    if (!t.globalModelRoot) {
      setModelStatus("No model available for this task");
      setIsLoadingModel(false);
      return;
    }

    (async () => {
      try {
        setModelStatus("Downloading model weights from 0G Storage...");
        const resp = await fetch("/api/storage/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rootHash: t.globalModelRoot }),
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);

        const serialized: SerializedModel = JSON.parse(data.content);
        setSerializedModel(serialized);

        if (serialized.headWeights.length > 0) {
          setModelStatus("Loading model into TensorFlow.js...");
          const head = await deserializeHead(serialized);
          setModel(head);
          setModelStatus("");
          setMessages([
            {
              role: "assistant",
              content: `Model loaded! "${t.name}" (Round ${serialized.round}).\n\nI can classify images into: ${ANIMAL_CLASSES.join(", ")}.\n\nUpload an image to get started.`,
            },
          ]);
        } else {
          setModelStatus("");
          setMessages([
            {
              role: "assistant",
              content: `Model "${t.name}" loaded but has no trained weights yet. Training needs to be completed first.`,
            },
          ]);
        }
      } catch (err) {
        setModelStatus(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      }
      setIsLoadingModel(false);
    })();
  }, [selectedTask, isLoadingModel]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !model) return;

    setIsClassifying(true);
    const preview = URL.createObjectURL(file);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Classify this image:", image: preview },
    ]);

    try {
      const img = await loadImageFromFile(file);
      const features = await extractFeatures([img]);
      const probs = (model.predict(features) as { dataSync: () => Float32Array }).dataSync();
      features.dispose();

      const predictions = ANIMAL_CLASSES.map((cls, i) => ({
        class: cls,
        confidence: probs[i],
      })).sort((a, b) => b.confidence - a.confidence);

      const top = predictions[0];
      const response =
        `**${top.class.charAt(0).toUpperCase() + top.class.slice(1)}** (${(top.confidence * 100).toFixed(1)}% confidence)\n\n` +
        `Top predictions:\n` +
        predictions
          .slice(0, 5)
          .map((p, i) => `${i + 1}. ${p.class}: ${(p.confidence * 100).toFixed(1)}%`)
          .join("\n");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response, predictions: predictions.slice(0, 5) },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Classification failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    }

    setIsClassifying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [model]);

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-900">&larr;</Link>
          <h1 className="text-xl font-bold text-gray-900">Use Model</h1>
        </div>
        <ConnectButton />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-500">Available Models</h2>

          {taskCount === 0 ? (
            <div className="text-sm text-gray-400">No models available</div>
          ) : (
            <div className="space-y-3">
              {Array.from({ length: taskCount }, (_, i) => (
                <ModelListItem
                  key={i}
                  taskId={i}
                  isSelected={selectedTaskId === i}
                  onSelect={() => loadModel(i)}
                />
              ))}
            </div>
          )}

          {/* Download */}
          {serializedModel && serializedModel.headWeights?.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-500">Download Model</h3>
              <div className="space-y-2">
                <button
                  onClick={() => downloadAsJSON(serializedModel, `model-task${selectedTaskId}.json`)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Download .json</span>
                  <span className="block text-xs text-gray-500">TF.js compatible</span>
                </button>
                <button
                  onClick={() => downloadAsPKL(serializedModel, `model-task${selectedTaskId}.pkl`)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">Download .pkl</span>
                  <span className="block text-xs text-gray-500">Python/NumPy compatible</span>
                </button>
              </div>
            </div>
          )}

          {/* Model info */}
          {serializedModel && (
            <div className="mt-4 border-t border-gray-200 pt-4 text-xs text-gray-500 space-y-1">
              <div>Architecture: {serializedModel.architecture}</div>
              <div>Round: {serializedModel.round}</div>
              <div>Classes: {serializedModel.classes.length}</div>
              {serializedModel.metrics.accuracy > 0 && (
                <div className="text-green-600 font-medium">
                  Accuracy: {(serializedModel.metrics.accuracy * 100).toFixed(1)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col">
          {selectedTaskId === null ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-lg font-medium text-gray-900">Select a model to start</div>
                <div className="mt-1 text-sm text-gray-500">Choose a model from the sidebar to classify images</div>
              </div>
            </div>
          ) : isLoadingModel ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                <div className="text-sm text-gray-500">{modelStatus}</div>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-lg rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "border border-gray-200 bg-white text-gray-800 shadow-sm"
                      }`}
                    >
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Uploaded"
                          className="mb-2 h-48 w-48 rounded-lg object-cover"
                        />
                      )}
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                      {msg.predictions && (
                        <div className="mt-3 space-y-2">
                          {msg.predictions.map((p, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full ${
                                    j === 0 ? "bg-green-500" : "bg-gray-300"
                                  }`}
                                  style={{ width: `${p.confidence * 100}%` }}
                                />
                              </div>
                              <span className="w-24 text-right text-xs text-gray-500">
                                {p.class} {(p.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isClassifying && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
                        Classifying...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Upload bar */}
              <div className="border-t border-gray-200 bg-white p-4">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!model || isClassifying}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16v-8m0 0l-3 3m3-3l3 3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {!model
                      ? "Load a model first"
                      : isClassifying
                        ? "Classifying..."
                        : "Upload an image to classify"}
                  </button>
                </div>
                {modelStatus && (
                  <div className="mt-2 text-center text-sm text-gray-500">{modelStatus}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelListItem({
  taskId,
  isSelected,
  onSelect,
}: {
  taskId: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { data: task } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const t = task as {
    name: string;
    currentRound: bigint;
    totalRounds: bigint;
    completed: boolean;
  } | undefined;

  if (!t) return null;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
        isSelected
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : "border-gray-200 bg-white shadow-sm hover:shadow-md"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
          isSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
        }`}>
          {taskId + 1}
        </div>
        <div>
          <div className="font-medium text-gray-900">{t.name}</div>
          <div className="mt-0.5 text-xs text-gray-500">
            Round {t.currentRound.toString()}/{t.totalRounds.toString()}
            {t.completed && <span className="ml-2 font-medium text-green-600">Complete</span>}
          </div>
        </div>
      </div>
    </button>
  );
}
