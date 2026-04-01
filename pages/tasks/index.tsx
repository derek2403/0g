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
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-400 hover:text-gray-900">&larr;</Link>
          <h1 className="text-xl font-bold text-gray-900">FL Tasks</h1>
        </div>
        <ConnectButton />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">Tasks</h2>
        <p className="mt-2 text-gray-600">
          Browse and join federated learning tasks on the 0G network.
        </p>

        {!isConnected ? (
          <div className="py-20 text-center text-gray-500">Connect wallet to view tasks</div>
        ) : taskCount === 0 ? (
          <div className="py-20 text-center">
            <div className="mb-4 text-gray-500">No tasks yet</div>
            <Link href="/demo" className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700">
              Launch Demo to create one
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
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

  if (!task) {
    return <div className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-white" />;
  }

  const t = task as {
    name: string;
    description: string;
    currentRound: bigint;
    totalRounds: bigint;
    completed: boolean;
    creator: string;
    globalModelRoot: string;
  };

  const participantList = (participants as string[] | undefined) || [];
  const metricsArr = metrics as unknown as { accuracy: bigint; f1Score: bigint }[] | undefined;
  const latestMetrics = metricsArr && metricsArr.length > 0
    ? metricsArr[metricsArr.length - 1]
    : null;

  return (
    <Link href={`/tasks/${taskId}`}>
      <div className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-6 transition hover:shadow-md">
        {/* Top: avatar + title + status */}
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-400">
            FL
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-gray-900">
                {t.name} (#{taskId})
              </h3>
              <span className="shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                Task
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug text-gray-500">
              {t.description}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
            <span className={`h-2 w-2 rounded-full ${t.completed ? "bg-green-500" : "bg-amber-400"}`} />
            {t.completed ? "Complete" : "In Progress"}
          </span>
        </div>

        {/* Bottom: info badges + button */}
        <div className="mt-5 flex items-end justify-between">
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              Round {t.currentRound.toString()}/{t.totalRounds.toString()}
            </span>
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {participantList.length} participant{participantList.length !== 1 ? "s" : ""}
            </span>
            {latestMetrics && (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Acc: {(Number(latestMetrics.accuracy) / 100).toFixed(1)}%
              </span>
            )}
            <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-medium text-gray-500">
              {t.creator.slice(0, 6)}...{t.creator.slice(-4)}
            </span>
          </div>
          <span className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            View Task
          </span>
        </div>
      </div>
    </Link>
  );
}
