import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import {
  FL_CONTRACT_ABI,
  FL_CONTRACT_ADDRESS,
} from "@/lib/fl-contract-abi";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Tasks() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: nextTaskId } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "nextTaskId",
  });

  const taskCount = Number(nextTaskId || 0);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-white">&larr;</Link>
          <h1 className="text-xl font-bold">FL Tasks</h1>
        </div>
        <ConnectButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {!isConnected ? (
          <div className="text-center py-20 text-gray-500">Connect wallet to view tasks</div>
        ) : taskCount === 0 ? (
          <div className="text-center py-20">
            <div className="text-gray-500 mb-4">No tasks yet</div>
            <Link href="/demo" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition">
              Launch Demo to create one
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from({ length: taskCount }, (_, i) => (
              <TaskCard key={i} taskId={i} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TaskCard({ taskId }: { taskId: number }) {
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

  if (!task) return <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 animate-pulse h-32" />;

  const t = task as {
    name: string;
    description: string;
    currentRound: bigint;
    totalRounds: bigint;
    completed: boolean;
    creator: string;
    globalModelRoot: string;
  };

  const latestMetrics = metrics && (metrics as unknown[]).length > 0
    ? (metrics as { accuracy: bigint; f1Score: bigint }[])[(metrics as unknown[]).length - 1]
    : null;

  return (
    <Link href={`/tasks/${taskId}`}>
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-gray-600 transition cursor-pointer">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{t.name}</h3>
            <p className="text-gray-400 text-sm mt-1">{t.description}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            t.completed ? "bg-green-900 text-green-400" : "bg-blue-900 text-blue-400"
          }`}>
            {t.completed ? "Complete" : "In Progress"}
          </span>
        </div>
        <div className="flex gap-6 mt-4 text-sm text-gray-400">
          <div>Round: {t.currentRound.toString()}/{t.totalRounds.toString()}</div>
          <div>Participants: {(participants as string[] | undefined)?.length || 0}</div>
          {latestMetrics && (
            <div className="text-green-400">
              Accuracy: {(Number(latestMetrics.accuracy) / 100).toFixed(2)}%
            </div>
          )}
          <div className="truncate">
            Creator: {t.creator.slice(0, 6)}...{t.creator.slice(-4)}
          </div>
        </div>
      </div>
    </Link>
  );
}
