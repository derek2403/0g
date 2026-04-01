import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract } from "wagmi";
import {
  FL_CONTRACT_ABI,
  FL_CONTRACT_ADDRESS,
} from "@/lib/fl-contract-abi";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Home() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: nextTaskId } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "nextTaskId",
  });

  const { data: totalMinted } = useReadContract({
    address: FL_CONTRACT_ADDRESS as `0x${string}`,
    abi: FL_CONTRACT_ABI,
    functionName: "totalMinted",
  });

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          PrivTrain <span className="text-sm font-normal text-gray-400">on 0G</span>
        </h1>
        <ConnectButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">
            Decentralized Federated Learning
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Train ML models collaboratively without sharing data. Model updates
            stored on 0G Storage, coordinated on-chain, final model minted as
            INFT.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-16">
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800">
            <div className="text-3xl font-bold text-blue-400">
              {nextTaskId?.toString() || "0"}
            </div>
            <div className="text-gray-400 mt-1">FL Tasks</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800">
            <div className="text-3xl font-bold text-green-400">
              {totalMinted?.toString() || "0"}
            </div>
            <div className="text-gray-400 mt-1">Model INFTs</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-6 text-center border border-gray-800">
            <div className="text-3xl font-bold text-purple-400">0G</div>
            <div className="text-gray-400 mt-1">Galileo Testnet</div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 mb-12">
          <h3 className="text-xl font-semibold mb-6">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                step: "1",
                title: "Create Task",
                desc: "Upload initial model to 0G Storage, configure rounds & rewards on-chain",
              },
              {
                step: "2",
                title: "Local Training",
                desc: "Participants train locally (or via 0G Compute), upload gradients to 0G Storage",
              },
              {
                step: "3",
                title: "Aggregate",
                desc: "FedAvg aggregation produces improved global model, metrics recorded on-chain",
              },
              {
                step: "4",
                title: "Mint INFT",
                desc: "Final model minted as ERC-7857 INFT with full training history",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-3 text-sm font-bold">
                  {item.step}
                </div>
                <div className="font-semibold mb-1">{item.title}</div>
                <div className="text-gray-400 text-sm">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {isConnected ? (
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/create"
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold transition"
            >
              Create FL Task
            </Link>
            <Link
              href="/tasks"
              className="bg-gray-800 hover:bg-gray-700 px-8 py-3 rounded-lg font-semibold transition border border-gray-700"
            >
              View Tasks
            </Link>
            <Link
              href="/use"
              className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-lg font-semibold transition"
            >
              Use Model
            </Link>
          </div>
        ) : (
          <div className="text-center text-gray-500">
            Connect your wallet to get started
          </div>
        )}
      </main>
    </div>
  );
}
