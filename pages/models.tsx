import { useState } from "react";

interface ModelNode {
  address: string;
}

interface Model {
  id: number;
  name: string;
  description: string;
  status: "Active" | "Available for hosting";
  requiredNodes: number;
  nodes: ModelNode[];
  endpointUrl: string;
  modelUrl: string;
}

const MODELS: Model[] = [
  {
    id: 1,
    name: "TinyLlama-1.1B-Chat-v1.0",
    description:
      "A lightweight, chat-optimized LLaMA-based model with 1.1B parameters, designed for efficient conversational AI",
    status: "Active",
    requiredNodes: 2,
    nodes: [
      { address: "0xEE09...977e" },
      { address: "0x9787...A8f1" },
    ],
    endpointUrl:
      "https://2ac100b57f58fc36993159c1d069cc33b10e8d3f-5001.dstack-prod5.phala.network",
    modelUrl:
      "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  },
  {
    id: 2,
    name: "TinyLlama-1.1B-Chat-v1.0",
    description:
      "A lightweight, chat-optimized LLaMA-based model with 1.1B parameters, designed for efficient conversational AI",
    status: "Active",
    requiredNodes: 2,
    nodes: [
      { address: "0x1C4e...D6C6" },
      { address: "0xf1a7...9092" },
    ],
    endpointUrl:
      "https://2ac100b57f58fc36993159c1d069cc33b10e8d3f-5001.dstack-prod5.phala.network",
    modelUrl:
      "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  },
  {
    id: 3,
    name: "TinyLlama-1.1B-Chat-v1.0",
    description:
      "A lightweight, chat-optimized LLaMA-based model with 1.1B parameters, designed for efficient conversational AI",
    status: "Active",
    requiredNodes: 2,
    nodes: [
      { address: "0x41Db...f2f7" },
      { address: "0x1C4e...D6C6" },
    ],
    endpointUrl:
      "https://2ac100b57f58fc36993159c1d069cc33b10e8d3f-5001.dstack-prod5.phala.network",
    modelUrl:
      "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  },
  {
    id: 4,
    name: "TinyLlama-1.1B-Chat-v1.0",
    description:
      "A lightweight, chat-optimized LLaMA-based model with 1.1B parameters, designed for efficient conversational AI",
    status: "Available for hosting",
    requiredNodes: 2,
    nodes: [{ address: "0x1C4e...D6C6" }],
    endpointUrl:
      "https://2ac100b57f58fc36993159c1d069cc33b10e8d3f-5001.dstack-prod5.phala.network",
    modelUrl:
      "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  },
];

function StatusBadge({ status }: { status: Model["status"] }) {
  const isActive = status === "Active";
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          isActive ? "bg-green-500" : "bg-amber-500"
        }`}
      />
      {isActive ? "Active" : "Available for hosting"}
    </span>
  );
}

function NodeBadge({ address }: { address: string }) {
  return (
    <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
      {address}
    </span>
  );
}

function ModelCard({
  model,
  onViewInstructions,
}: {
  model: Model;
  onViewInstructions: () => void;
}) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div>
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-500">
              T
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {model.name} (#{model.id})
              </h3>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                Model
              </span>
            </div>
          </div>
          <StatusBadge status={model.status} />
        </div>

        <p className="mb-4 text-sm leading-relaxed text-gray-600">
          {model.description}
        </p>

        <p className="mb-2 text-xs text-gray-500">
          Hosted by {model.nodes.length} node(s) of {model.requiredNodes}{" "}
          required
        </p>

        <div className="flex flex-wrap gap-2">
          {model.nodes.map((node) => (
            <NodeBadge key={node.address} address={node.address} />
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onViewInstructions}
          className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          View Instructions
        </button>
      </div>
    </div>
  );
}

const CODE_EXAMPLES = {
  javascript: (url: string) => `import fetch from 'node-fetch';

async function generateText(prompt) {
  try {
    const response = await fetch("${url}/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt
      }),
    });

    const data = await response.json();
    return data.output;
  } catch (error) {
    console.error("Error generating text:", error);
    throw error;
  }
}

// Example usage
generateText("Write a short poem about AI")
  .then(result => console.log(result))
  .catch(err => console.error(err));`,

  python: (url: string) => `import requests

def generate_text(prompt):
    response = requests.post(
        "${url}/generate",
        json={"prompt": prompt},
        headers={"Content-Type": "application/json"},
    )
    response.raise_for_status()
    return response.json()["output"]

# Example usage
result = generate_text("Write a short poem about AI")
print(result)`,

  nextjs: (url: string) => `// pages/api/generate.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const response = await fetch("${url}/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: req.body.prompt }),
  });

  const data = await response.json();
  res.status(200).json(data);
}`,
};

type CodeTab = "javascript" | "python" | "nextjs";

const TAB_LABELS: Record<CodeTab, string> = {
  javascript: "JavaScript",
  python: "Python",
  nextjs: "Next.js Proxy",
};

function InstructionsModal({
  model,
  onClose,
}: {
  model: Model;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<CodeTab>("javascript");
  const activeNodes = model.nodes.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-900">{model.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {model.description}
        </p>

        {/* Status */}
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
            <span className="font-semibold text-green-800">
              Model is active and ready to use
            </span>
          </div>
          <p className="mb-3 text-sm text-green-700">
            This model is being hosted by {activeNodes} node(s) and is available
            for inference.
          </p>
          <div className="flex flex-wrap gap-3">
            {model.nodes.map((node, i) => (
              <span
                key={node.address}
                className="flex-1 rounded-md border border-green-200 bg-white px-3 py-2 text-center text-sm text-gray-700"
              >
                Node {i + 1}: {node.address}
              </span>
            ))}
          </div>
        </div>

        {/* Getting Started */}
        <h3 className="mt-8 text-xl font-bold text-gray-900">
          Getting Started
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Below are example code snippets for using this model. The model
          endpoint URL is:
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3">
          <code className="flex-1 break-all text-sm text-gray-700">
            {model.endpointUrl}
          </code>
          <button
            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
            title="Copy URL"
            onClick={() => navigator.clipboard.writeText(model.endpointUrl)}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>

        {/* Code Tabs */}
        <div className="mt-6">
          <div className="flex border-b border-gray-200">
            {(Object.keys(TAB_LABELS) as CodeTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`cursor-pointer px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className="relative mt-4 overflow-x-auto rounded-lg bg-gray-100 p-4 pr-12">
            <button
              className="absolute right-3 top-3 cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
              title="Copy code"
              onClick={() =>
                navigator.clipboard.writeText(
                  CODE_EXAMPLES[activeTab](model.endpointUrl)
                )
              }
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
            <pre className="text-sm leading-relaxed text-gray-700">
              <code>{CODE_EXAMPLES[activeTab](model.endpointUrl)}</code>
            </pre>
          </div>
        </div>

        {/* Model Information */}
        <h3 className="mt-8 text-xl font-bold text-gray-900">
          Model Information
        </h3>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="font-medium text-gray-500">Model URL:</dt>
          <dd>
            <a
              href={model.modelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-blue-600 hover:underline"
            >
              {model.modelUrl}
            </a>
          </dd>
          <dt className="font-medium text-gray-500">Node URL:</dt>
          <dd className="break-all text-gray-800">{model.endpointUrl}</dd>
          <dt className="font-medium text-gray-500">Number of Nodes:</dt>
          <dd className="text-gray-800">{model.requiredNodes}</dd>
          <dt className="font-medium text-gray-500">Active Nodes:</dt>
          <dd className="text-gray-800">{activeNodes}</dd>
        </dl>

        {/* Close Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-900">Models</h1>
        <p className="mt-2 text-gray-600">
          Try, test, and deploy from a wide range of model types, sizes, and
          specializations.{" "}
          <a href="#" className="text-blue-600 hover:underline">
            Learn more
          </a>
          .
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {MODELS.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onViewInstructions={() => setSelectedModel(model)}
            />
          ))}
        </div>
      </div>

      {selectedModel && (
        <InstructionsModal
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </div>
  );
}
