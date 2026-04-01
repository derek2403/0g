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
  image?: string; // data URL for user uploads
  predictions?: { class: string; confidence: number }[];
}

export default function UseModel() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Model state
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [serializedModel, setSerializedModel] = useState<SerializedModel | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [modelStatus, setModelStatus] = useState("");

  // Chat state
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load a model INFT
  const loadModel = useCallback(async (taskId: number) => {
    setIsLoadingModel(true);
    setModelStatus("Loading task from chain...");
    setMessages([]);

    try {
      // Fetch task data from API to get globalModelRoot
      const taskResp = await fetch("/api/storage/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootHash: "" }), // we'll get the root from chain
      });
      // Actually, we need to read the task first. Let's use the contract read from the component.
      setModelStatus("Downloading model from 0G Storage...");

      // We'll trigger this after we have the task data
      setSelectedTaskId(taskId);
    } catch (err) {
      setModelStatus(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      setIsLoadingModel(false);
    }
  }, []);

  // Task data for selected model
  const { data: selectedTask } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getTask",
    args: selectedTaskId !== null ? [BigInt(selectedTaskId)] : undefined,
  });

  // When task data loads, download the model
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

  // Classify an uploaded image
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !model) return;

    setIsClassifying(true);
    const preview = URL.createObjectURL(file);

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Classify this image:`, image: preview },
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
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [model]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white">&larr;</Link>
          <h1 className="text-xl font-bold">Use Model</h1>
        </div>
        <ConnectButton />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Model selection */}
        <div className="w-72 border-r border-gray-800 p-4 overflow-y-auto shrink-0">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Available Models</h2>

          {taskCount === 0 ? (
            <div className="text-gray-500 text-sm">No models available</div>
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

          {/* Download buttons */}
          {serializedModel && serializedModel.headWeights?.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-800">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Download Model</h3>
              <div className="space-y-2">
                <button
                  onClick={() => downloadAsJSON(serializedModel, `model-task${selectedTaskId}.json`)}
                  className="w-full bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition text-left"
                >
                  Download .json
                  <span className="block text-xs text-gray-500">TF.js compatible</span>
                </button>
                <button
                  onClick={() => downloadAsPKL(serializedModel, `model-task${selectedTaskId}.pkl`)}
                  className="w-full bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm transition text-left"
                >
                  Download .pkl
                  <span className="block text-xs text-gray-500">Python/NumPy compatible</span>
                </button>
              </div>
            </div>
          )}

          {/* Model info */}
          {serializedModel && (
            <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
              <div>Architecture: {serializedModel.architecture}</div>
              <div>Round: {serializedModel.round}</div>
              <div>Classes: {serializedModel.classes.length}</div>
              {serializedModel.metrics.accuracy > 0 && (
                <div className="text-green-400">
                  Accuracy: {(serializedModel.metrics.accuracy * 100).toFixed(1)}%
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main: Chat interface */}
        <div className="flex-1 flex flex-col">
          {selectedTaskId === null ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-4xl mb-4">&#x1f9e0;</div>
                <div className="text-lg">Select a model to start classifying</div>
                <div className="text-sm mt-2">Choose from the sidebar</div>
              </div>
            </div>
          ) : isLoadingModel ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-4">&#x2699;</div>
                <div>{modelStatus}</div>
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
                      className={`max-w-lg rounded-xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-blue-600"
                          : "bg-gray-800 border border-gray-700"
                      }`}
                    >
                      {msg.image && (
                        <img
                          src={msg.image}
                          alt="Uploaded"
                          className="w-48 h-48 object-cover rounded-lg mb-2"
                        />
                      )}
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      {msg.predictions && (
                        <div className="mt-3 space-y-1">
                          {msg.predictions.map((p, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    j === 0 ? "bg-green-500" : "bg-gray-500"
                                  }`}
                                  style={{ width: `${p.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 w-20 text-right">
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
                    <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-400">
                      Classifying...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
              <div className="border-t border-gray-800 p-4">
                <div className="max-w-3xl mx-auto flex items-center gap-3">
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
                    className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 border border-gray-700 px-6 py-3 rounded-xl transition text-sm font-medium"
                  >
                    {!model
                      ? "Load a model first"
                      : isClassifying
                        ? "Classifying..."
                        : "Upload an image to classify"}
                  </button>
                </div>
                {modelStatus && (
                  <div className="text-center text-sm text-gray-500 mt-2">{modelStatus}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Model list item component
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
      className={`w-full text-left p-3 rounded-lg transition text-sm ${
        isSelected
          ? "bg-blue-600/20 border border-blue-500"
          : "bg-gray-800/50 border border-gray-800 hover:border-gray-600"
      }`}
    >
      <div className="font-medium">{t.name}</div>
      <div className="text-xs text-gray-400 mt-1">
        Round {t.currentRound.toString()}/{t.totalRounds.toString()}
        {t.completed && <span className="text-green-400 ml-2">Complete</span>}
      </div>
    </button>
  );
}
