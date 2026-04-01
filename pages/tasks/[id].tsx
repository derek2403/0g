import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import { fedAvg } from "@/lib/model";
import type { SerializedModel } from "@/lib/model";
import { useRouter } from "next/router";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

export default function TaskDetail() {
  const router = useRouter();
  const { id } = router.query;
  const taskId = id ? Number(id) : 0;
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: task, refetch: refetchTask } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getTask",
    args: [BigInt(taskId)],
  });

  const { data: participants } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getParticipants",
    args: [BigInt(taskId)],
  });

  const { data: metrics, refetch: refetchMetrics } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getMetricsHistory",
    args: [BigInt(taskId)],
  });

  const t = task as {
    name: string;
    description: string;
    globalModelRoot: string;
    initialModelRoot: string;
    currentRound: bigint;
    totalRounds: bigint;
    minParticipants: bigint;
    rewardPool: bigint;
    creator: string;
    completed: boolean;
    createdAt: bigint;
  } | undefined;

  const currentRound = t ? Number(t.currentRound) : 0;

  const { data: roundUpdates } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getRoundUpdates",
    args: [BigInt(taskId), BigInt(currentRound)],
  });

  const { writeContract: aggregateTx, data: aggTxHash } = useWriteContract();
  const { isSuccess: aggConfirmed } = useWaitForTransactionReceipt({ hash: aggTxHash });
  const [isAggregating, setIsAggregating] = useState(false);
  const [aggStatus, setAggStatus] = useState("");

  const isCreator = t && address && t.creator.toLowerCase() === address.toLowerCase();

  const updatesArr = (roundUpdates || []) as {
    participant: string;
    storageRoot: string;
    dataSize: bigint;
    roundId: bigint;
    timestamp: bigint;
  }[];

  const metricsArr = (metrics || []) as unknown as {
    accuracy: bigint;
    f1Score: bigint;
    precision_: bigint;
    recall: bigint;
    loss: bigint;
    timestamp: bigint;
  }[];

  const participantList = (participants || []) as string[];

  const canAggregate =
    isCreator &&
    t &&
    !t.completed &&
    updatesArr.length >= Number(t.minParticipants);

  const handleAggregate = useCallback(async () => {
    if (!t || !canAggregate) return;
    setIsAggregating(true);
    setAggStatus("Downloading participant updates from 0G Storage...");

    try {
      const updates: { model: SerializedModel; dataSize: number }[] = [];
      for (const update of updatesArr) {
        const resp = await fetch("/api/storage/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rootHash: update.storageRoot }),
        });
        const data = await resp.json();
        if (data.success) {
          updates.push({
            model: JSON.parse(data.content) as SerializedModel,
            dataSize: Number(update.dataSize),
          });
        }
      }

      if (updates.length === 0) throw new Error("No valid updates downloaded");

      setAggStatus(`Downloaded ${updates.length} models. Running FedAvg...`);
      const aggregated = fedAvg(updates);

      const bestMetrics = updates
        .map((u) => u.model.metrics)
        .sort((a, b) => b.accuracy - a.accuracy)[0];
      aggregated.metrics = bestMetrics;

      setAggStatus("Uploading aggregated model to 0G Storage...");
      const uploadResp = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(aggregated) }),
      });
      const uploadData = await uploadResp.json();
      if (!uploadData.success) throw new Error(uploadData.error);

      setAggStatus("Recording on-chain...");
      aggregateTx({
        address: FL_CONTRACT_ADDRESS as `0x${string}`,
        abi: FL_CONTRACT_ABI,
        functionName: "aggregateRound",
        args: [
          BigInt(taskId),
          uploadData.rootHash,
          BigInt(Math.round(bestMetrics.accuracy * 10000)),
          BigInt(Math.round(bestMetrics.f1Score * 10000)),
          BigInt(Math.round(bestMetrics.precision * 10000)),
          BigInt(Math.round(bestMetrics.recall * 10000)),
          BigInt(Math.round(bestMetrics.loss * 10000)),
        ],
      });
    } catch (err) {
      setAggStatus(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
      setIsAggregating(false);
    }
  }, [t, canAggregate, updatesArr, taskId, aggregateTx]);

  useEffect(() => {
    if (aggConfirmed) {
      setAggStatus("Round aggregated successfully!");
      setIsAggregating(false);
      refetchTask();
      refetchMetrics();
    }
  }, [aggConfirmed, refetchTask, refetchMetrics]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <main className="mx-auto max-w-5xl px-6 py-8">
        {!isConnected ? (
          <div className="py-20 text-center text-gray-500">Connect wallet</div>
        ) : !t ? (
          <div className="py-20 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Task Info */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{t.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                </div>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className={`h-2 w-2 rounded-full ${t.completed ? "bg-green-500" : "bg-amber-400"}`} />
                  {t.completed ? "Complete" : "In Progress"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-xs text-gray-400">Round</div>
                  <div className="text-lg font-bold tabular-nums text-gray-900">{t.currentRound.toString()}/{t.totalRounds.toString()}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-xs text-gray-400">Participants</div>
                  <div className="text-lg font-bold tabular-nums text-gray-900">{participantList.length}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-xs text-gray-400">Min Participants</div>
                  <div className="text-lg font-bold tabular-nums text-gray-900">{t.minParticipants.toString()}</div>
                </div>
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-xs text-gray-400">Reward Pool</div>
                  <div className="text-lg font-bold tabular-nums text-gray-900">{t.rewardPool.toString()} wei</div>
                </div>
              </div>

              <div className="mt-5 flex items-end gap-6 border-t border-gray-200 pt-5">
                <dl className="min-w-0 flex-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-400">Creator</dt>
                  <dd className="truncate font-mono text-xs text-gray-600">{t.creator}</dd>
                  <dt className="text-gray-400">Model Root</dt>
                  <dd className="break-all font-mono text-xs text-gray-600">{t.globalModelRoot}</dd>
                </dl>
                <div className="flex shrink-0 gap-3">
                  {!t.completed && (
                    <Link
                      href={`/participate/${taskId}`}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Join & Train
                    </Link>
                  )}
                  {t.completed && (
                    <Link
                      href="/use"
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Use Model
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Coordinator: Aggregation Panel */}
            {isCreator && !t.completed && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <h3 className="font-semibold text-gray-900">Coordinator Panel</h3>
                <div className="mt-2 text-sm text-gray-500">
                  Round {currentRound} submissions: <span className="font-bold text-gray-900">{updatesArr.length}</span> / {t.minParticipants.toString()} required
                </div>

                {updatesArr.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {updatesArr.map((u, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                        <span className="text-gray-400">{i + 1}.</span>
                        <span className="font-mono text-gray-600">{u.participant.slice(0, 10)}...{u.participant.slice(-6)}</span>
                        <span className="text-gray-400">{Number(u.dataSize)} images</span>
                        <span className="flex-1 truncate font-mono text-gray-400">{u.storageRoot.slice(0, 20)}...</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleAggregate}
                  disabled={!canAggregate || isAggregating}
                  className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {isAggregating
                    ? "Aggregating..."
                    : !canAggregate
                      ? `Waiting for ${Number(t.minParticipants) - updatesArr.length} more submission(s)`
                      : `Aggregate Round ${currentRound} (${updatesArr.length} updates)`}
                </button>

                {aggStatus && (
                  <div className={`mt-3 text-sm ${
                    aggStatus.includes("Error") ? "text-red-600" : "text-amber-700"
                  }`}>
                    {aggStatus}
                  </div>
                )}
              </div>
            )}

            {/* Metrics History */}
            {metricsArr.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="font-semibold text-gray-900">Metrics History</h3>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 text-left text-xs font-medium text-gray-400">Round</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-400">Accuracy</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-400">F1</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-400">Precision</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-400">Recall</th>
                        <th className="py-2 text-left text-xs font-medium text-gray-400">Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricsArr.map((m, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2.5 tabular-nums text-gray-900">{i}</td>
                          <td className="py-2.5 tabular-nums text-gray-900">{(Number(m.accuracy) / 100).toFixed(2)}%</td>
                          <td className="py-2.5 tabular-nums text-gray-900">{(Number(m.f1Score) / 100).toFixed(2)}%</td>
                          <td className="py-2.5 tabular-nums text-gray-900">{(Number(m.precision_) / 100).toFixed(2)}%</td>
                          <td className="py-2.5 tabular-nums text-gray-900">{(Number(m.recall) / 100).toFixed(2)}%</td>
                          <td className="py-2.5 tabular-nums text-gray-900">{(Number(m.loss) / 100).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 space-y-2">
                  {metricsArr.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-16 text-gray-400">Round {i}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${Number(m.accuracy) / 100}%` }}
                        />
                      </div>
                      <span className="w-14 text-right tabular-nums text-gray-900">
                        {(Number(m.accuracy) / 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participants */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="font-semibold text-gray-900">Participants</h3>
              {participantList.length === 0 ? (
                <div className="mt-3 text-sm text-gray-400">No participants yet</div>
              ) : (
                <div className="mt-4 space-y-2">
                  {participantList.map((addr, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="text-gray-400">{i + 1}.</span>
                      <span className="font-mono text-gray-600">{addr}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
