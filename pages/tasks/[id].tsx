import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import { FL_CONTRACT_ABI, FL_CONTRACT_ADDRESS } from "@/lib/fl-contract-abi";
import { useRouter } from "next/router";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function TaskDetail() {
  const router = useRouter();
  const { id } = router.query;
  const taskId = id ? Number(id) : 0;
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: task } = useReadContract({
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

  const { data: metrics } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "getMetricsHistory",
    args: [BigInt(taskId)],
  });

  if (!mounted) return null;

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

  const metricsArr = (metrics || []) as {
    accuracy: bigint;
    f1Score: bigint;
    precision_: bigint;
    recall: bigint;
    loss: bigint;
    timestamp: bigint;
  }[];

  const participantList = (participants || []) as string[];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/tasks" className="text-gray-400 hover:text-white">&larr;</Link>
          <h1 className="text-xl font-bold">Task #{taskId}</h1>
        </div>
        <ConnectButton />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {!isConnected ? (
          <div className="text-center py-20 text-gray-500">Connect wallet</div>
        ) : !t ? (
          <div className="text-center py-20 text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Task Info */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{t.name}</h2>
                  <p className="text-gray-400 mt-1">{t.description}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  t.completed ? "bg-green-900 text-green-400" : "bg-blue-900 text-blue-400"
                }`}>
                  {t.completed ? "Complete" : "In Progress"}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Round</span>
                  <div className="text-lg font-bold">{t.currentRound.toString()}/{t.totalRounds.toString()}</div>
                </div>
                <div>
                  <span className="text-gray-500">Participants</span>
                  <div className="text-lg font-bold">{participantList.length}</div>
                </div>
                <div>
                  <span className="text-gray-500">Min Participants</span>
                  <div className="text-lg font-bold">{t.minParticipants.toString()}</div>
                </div>
                <div>
                  <span className="text-gray-500">Reward Pool</span>
                  <div className="text-lg font-bold">{t.rewardPool.toString()} wei</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800 text-sm">
                <div className="text-gray-500 mb-1">Creator</div>
                <div className="font-mono text-xs text-gray-300">{t.creator}</div>
                <div className="text-gray-500 mt-2 mb-1">Current Model Root</div>
                <div className="font-mono text-xs text-blue-400 break-all">{t.globalModelRoot}</div>
              </div>
            </div>

            {/* Metrics History */}
            {metricsArr.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="font-semibold mb-4">Metrics History</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-2">Round</th>
                        <th className="text-left py-2">Accuracy</th>
                        <th className="text-left py-2">F1</th>
                        <th className="text-left py-2">Precision</th>
                        <th className="text-left py-2">Recall</th>
                        <th className="text-left py-2">Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricsArr.map((m, i) => (
                        <tr key={i} className="border-b border-gray-800/50">
                          <td className="py-2">{i}</td>
                          <td className="py-2 text-green-400">{(Number(m.accuracy) / 100).toFixed(2)}%</td>
                          <td className="py-2 text-blue-400">{(Number(m.f1Score) / 100).toFixed(2)}%</td>
                          <td className="py-2 text-yellow-400">{(Number(m.precision_) / 100).toFixed(2)}%</td>
                          <td className="py-2 text-purple-400">{(Number(m.recall) / 100).toFixed(2)}%</td>
                          <td className="py-2 text-red-400">{(Number(m.loss) / 100).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Visual progress */}
                <div className="mt-4 space-y-2">
                  {metricsArr.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500 w-16">Round {i}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-green-500 h-full rounded-full transition-all"
                          style={{ width: `${Number(m.accuracy) / 100}%` }}
                        />
                      </div>
                      <span className="text-green-400 w-14 text-right">
                        {(Number(m.accuracy) / 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Participants */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-semibold mb-4">Participants</h3>
              {participantList.length === 0 ? (
                <div className="text-gray-500 text-sm">No participants yet</div>
              ) : (
                <div className="space-y-2">
                  {participantList.map((addr, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm font-mono text-gray-300">
                      <span className="text-gray-500">{i + 1}.</span>
                      {addr}
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
