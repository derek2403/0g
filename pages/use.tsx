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
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-900">&larr;</Link>
          <h1 className="text-lg font-semibold text-gray-900">Use Model</h1>
        </div>
        <ConnectButton />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Models</h2>

            {taskCount === 0 ? (
              <div className="text-sm text-gray-400">No models available</div>
            ) : (
              <div className="space-y-2">
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
          </div>

          {/* Bottom section: downloads + info */}
          {serializedModel && (
            <div className="shrink-0 border-t border-gray-200 p-4">
              {/* Model meta */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                  <div className="text-gray-400">Round</div>
                  <div className="font-medium text-gray-900">{serializedModel.round}</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                  <div className="text-gray-400">Classes</div>
                  <div className="font-medium text-gray-900">{serializedModel.classes.length}</div>
                </div>
                {serializedModel.metrics.accuracy > 0 && (
                  <div className="col-span-2 rounded-lg bg-green-50 px-2.5 py-2">
                    <div className="text-green-600">Accuracy</div>
                    <div className="font-medium text-green-700">{(serializedModel.metrics.accuracy * 100).toFixed(1)}%</div>
                  </div>
                )}
              </div>

              {/* Downloads */}
              {serializedModel.headWeights?.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadAsJSON(serializedModel, `model-task${selectedTaskId}.json`)}
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    .json
                  </button>
                  <button
                    onClick={() => downloadAsPKL(serializedModel, `model-task${selectedTaskId}.pkl`)}
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    .pkl
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main chat area */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedTaskId === null ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-200">
                  <svg className="h-9 w-9 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-base font-medium text-gray-900">Animal Image Classifier</div>
                <div className="mx-auto mt-1.5 max-w-xs text-sm text-gray-500">
                  Select a model from the sidebar, then upload an image to classify
                </div>
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
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="mx-auto max-w-2xl space-y-5">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200">
                          <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 01-1.591.659H9.061a2.25 2.25 0 01-1.591-.659L5 14.5m14 0V17a2.25 2.25 0 01-2.25 2.25H7.25A2.25 2.25 0 015 17v-2.5" />
                          </svg>
                        </div>
                      )}
                      <div
                        className={`max-w-md rounded-2xl px-5 py-4 ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 bg-white text-gray-900"
                        }`}
                      >
                        {msg.image && (
                          <img src={msg.image} alt="Uploaded" className="mb-3 h-44 w-44 rounded-xl object-cover" />
                        )}
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</div>
                        {msg.predictions && (
                          <div className="mt-4 space-y-2">
                            {msg.predictions.map((p, j) => (
                              <div key={j} className="flex items-center gap-2.5">
                                <span className="w-20 truncate text-sm font-medium text-gray-700">{p.class}</span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                                  <div
                                    className={`h-full rounded-full transition-all ${j === 0 ? "bg-green-500" : "bg-gray-300"}`}
                                    style={{ width: `${p.confidence * 100}%` }}
                                  />
                                </div>
                                <span className="w-14 text-right text-sm font-medium tabular-nums text-gray-700">
                                  {(p.confidence * 100).toFixed(1)}%
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
                      <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border border-gray-200">
                        <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-[15px] text-gray-500">
                        Analyzing image...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* Upload bar */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
                <div className="mx-auto max-w-2xl">
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
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:border-gray-200 disabled:hover:bg-gray-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    {!model
                      ? "Load a model first"
                      : isClassifying
                        ? "Classifying..."
                        : "Upload an image to classify"}
                  </button>
                </div>
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

  const isComplete = t.completed;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        isSelected
          ? "border-blue-200 bg-blue-50/50"
          : "border-gray-200 bg-white hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          isSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
        }`}>
          T
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">{t.name}</span>
            <span className="shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
              Model
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>Round {t.currentRound.toString()}/{t.totalRounds.toString()}</span>
            <span className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${isComplete ? "bg-green-500" : "bg-amber-400"}`} />
              {isComplete ? "Complete" : "In progress"}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
