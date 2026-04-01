import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import { ANIMAL_CLASSES } from "@/lib/model";
import type { SerializedModel } from "@/lib/model";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function CreateTask() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [name, setName] = useState("Animal Classifier");
  const [description, setDescription] = useState(
    "Federated learning for 10-class animal image classification using MobileNet transfer learning"
  );
  const [totalRounds, setTotalRounds] = useState(3);
  const [minParticipants, setMinParticipants] = useState(2);
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [modelRootHash, setModelRootHash] = useState("");

  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // After tx confirms, redirect to tasks
  useEffect(() => {
    if (txConfirmed) {
      setStatus("Task created on-chain! Redirecting...");
      setTimeout(() => router.push("/tasks"), 2000);
    }
  }, [txConfirmed, router]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      // Step 1: Create initial model weights (random head)
      setStatus("Creating initial model weights...");
      const initialModel: SerializedModel = {
        version: "1.0.0",
        architecture: "mobilenet-v2-head-128-10",
        classes: [...ANIMAL_CLASSES],
        baseWeights: [],
        headWeights: [], // will be initialized by each participant's TF.js
        headShapes: [],
        round: 0,
        metrics: {
          accuracy: 0, f1Score: 0, precision: 0, recall: 0,
          loss: 999, timestamp: Date.now(),
        },
      };

      // Step 2: Upload to 0G Storage
      setStatus("Uploading initial model to 0G Storage...");
      const uploadResp = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(initialModel) }),
      });
      const uploadData = await uploadResp.json();
      if (!uploadData.success) throw new Error(uploadData.error);

      setModelRootHash(uploadData.rootHash);
      setStatus(`Model uploaded (${uploadData.rootHash.slice(0, 16)}...). Creating task on-chain...`);

      // Step 3: Create on-chain task
      writeContract({
        address: FL_CONTRACT_ADDRESS as `0x${string}`,
        abi: FL_CONTRACT_ABI,
        functionName: "createTask",
        args: [
          name,
          description,
          uploadData.rootHash,
          BigInt(totalRounds),
          BigInt(minParticipants),
        ],
      });
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsCreating(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <main className="max-w-xl mx-auto px-6 py-12">
        {!isConnected ? (
          <div className="text-center py-20 text-gray-500">Connect your wallet to create a task</div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">New Federated Learning Task</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Task Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Total Rounds</label>
                  <input
                    type="number"
                    value={totalRounds}
                    onChange={(e) => setTotalRounds(Number(e.target.value))}
                    min={1}
                    max={20}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Min Participants</label>
                  <input
                    type="number"
                    value={minParticipants}
                    onChange={(e) => setMinParticipants(Number(e.target.value))}
                    min={1}
                    max={100}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Model info */}
              <div className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600">
                <div className="font-medium text-gray-900 mb-2">Model Architecture</div>
                <div>Base: MobileNet V2 (frozen, loaded from CDN)</div>
                <div>Head: Dense(1280 &rarr; 128, ReLU) &rarr; Dropout(0.3) &rarr; Dense(128 &rarr; 10, Softmax)</div>
                <div>Classes: {ANIMAL_CLASSES.join(", ")}</div>
              </div>

              <button
                onClick={handleCreate}
                disabled={isCreating || !name}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition"
              >
                {isCreating ? "Creating..." : "Create Task & Upload Initial Model"}
              </button>

              {status && (
                <div className={`text-sm rounded-lg p-3 ${
                  status.includes("Error")
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-blue-50 text-blue-600 border border-blue-200"
                }`}>
                  {status}
                </div>
              )}

              {modelRootHash && (
                <div className="text-xs text-gray-500 break-all">
                  Model Root: {modelRootHash}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
