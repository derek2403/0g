import { useAccount } from "wagmi";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function Demo() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isSettingUp, setIsSettingUp] = useState(false);
  const [taskName, setTaskName] = useState("Animal Classifier");
  const [classesInput, setClassesInput] = useState("cat, dog, bird, fish, horse, elephant, bear, deer, frog, snake");
  const [result, setResult] = useState<{
    taskId: number;
    currentRound: number;
    totalRounds: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const parsedClasses = classesInput.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

  const handleSetup = async () => {
    if (parsedClasses.length < 2) { setError("Need at least 2 classes"); return; }
    setIsSettingUp(true);
    setError("");
    setProgress("Creating task and simulating 1 round of training... (this takes ~1 min)");

    try {
      const resp = await fetch("/api/fl/demo-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: taskName, classes: parsedClasses }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);
      setResult(data);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setProgress("");
    }
    setIsSettingUp(false);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20">
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
          <h2 className="text-2xl font-bold mb-4">Quick Demo</h2>
          <p className="text-gray-400 mb-6">
            This creates a pre-trained FL task at <span className="text-white font-semibold">round 1/2</span> with
            1 simulated round. You then do the <span className="text-white font-semibold">final round</span> yourself
            by uploading real images, training, and submitting. After aggregation, the model INFT is minted and you can use it
            on the <span className="text-white font-semibold">/use</span> page.
          </p>

          <div className="bg-gray-800/50 rounded-lg p-4 mb-6 text-sm">
            <div className="font-semibold text-gray-300 mb-2">Demo Flow:</div>
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>Click &quot;Setup Demo&quot; below (creates task + simulates 1 round)</li>
              <li>Open <span className="text-blue-400">/participate/[taskId]</span> - register, upload animal photos, train, submit</li>
              <li>Open <span className="text-blue-400">/tasks/[taskId]</span> - click Aggregate (as coordinator)</li>
              <li>Task completes at round 2/2 - model INFT minted!</li>
              <li>Go to <span className="text-blue-400">/use</span> - select model, classify images, download as .pkl</li>
            </ol>
          </div>

          {!result ? (
            <>
              <button
                onClick={handleSetup}
                disabled={isSettingUp}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-6 py-3 rounded-lg font-semibold transition"
              >
                {isSettingUp ? "Setting up..." : "Setup Demo (creates task at round 1/2)"}
              </button>

              {progress && (
                <div className="mt-4 text-sm text-blue-400 flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
                  {progress}
                </div>
              )}

              {error && (
                <div className="mt-4 text-sm text-red-400 bg-red-900/20 rounded-lg p-3">
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-900/30 rounded-lg p-4 border border-green-700">
                <div className="font-semibold text-green-400 mb-2">Demo Ready!</div>
                <div className="text-sm text-gray-300">{result.message}</div>
                <div className="text-sm text-gray-400 mt-2">
                  Task #{result.taskId} - Round {result.currentRound}/{result.totalRounds}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Link
                  href={`/participate/${result.taskId}`}
                  className="block bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-semibold transition text-center"
                >
                  Step 1: Participate & Train (final round)
                </Link>
                <Link
                  href={`/tasks/${result.taskId}`}
                  className="block bg-yellow-600 hover:bg-yellow-700 px-6 py-3 rounded-lg font-semibold transition text-center"
                >
                  Step 2: Aggregate (as coordinator)
                </Link>
                <Link
                  href="/use"
                  className="block bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold transition text-center"
                >
                  Step 3: Use Model & Download
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
