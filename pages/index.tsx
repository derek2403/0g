import { useState } from "react";

const STEPS = [
  {
    title: "Prerequisites",
    content: [
      { type: "list" as const, items: [
        "Node.js 18+",
        "MetaMask wallet with 0G Galileo testnet configured",
        "0G testnet tokens (get from 0G Faucet)",
      ]},
    ],
  },
  {
    title: "Setup",
    content: [
      { type: "text" as const, value: "Install dependencies:" },
      { type: "code" as const, value: "npm install" },
      { type: "text" as const, value: "Copy environment variables:" },
      { type: "code" as const, value: "cp .env.example .env" },
      { type: "text" as const, value: "Fill in your .env:" },
      { type: "code" as const, value: `# Private key for 0G Storage uploads (server-side)
ZG_STORAGE_PRIVATE_KEY=your_private_key_here

# WalletConnect project ID (get from https://cloud.walletconnect.com/)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Contract address (already deployed)
NEXT_PUBLIC_FL_CONTRACT_ADDRESS=0xc4e07a3716c2bCF814A1D4423C50532ebA71cC54` },
    ],
  },
  {
    title: "Run",
    content: [
      { type: "code" as const, value: "npm run dev" },
      { type: "text" as const, value: "Open http://localhost:3000/" },
    ],
  },
  {
    title: "Demo: Pre-setup",
    content: [
      { type: "text" as const, value: "Go to /demo and click Setup Demo. This creates a federated learning task at round 1/2 with one simulated training round (~1 min)." },
    ],
  },
  {
    title: "Create a Task",
    content: [
      { type: "text" as const, value: "Go to /create to create a new FL task. Configure the task name, number of rounds, and minimum participants. The initial model is uploaded to 0G Storage and the task is registered on-chain." },
    ],
  },
  {
    title: "Participate & Train",
    content: [
      { type: "text" as const, value: "Go to /participate/[taskId] on the pre-set 1/2 task:" },
      { type: "list" as const, items: [
        "Register as a participant (on-chain transaction)",
        "Upload labeled animal images (select class per batch: cat, dog, bird, etc.)",
        "Train \u2014 MobileNet V2 transfer learning runs locally in your browser",
        "Submit \u2014 trained weights are uploaded to 0G Storage and proof is recorded on-chain",
      ]},
    ],
  },
  {
    title: "Aggregate & Mint INFT",
    content: [
      { type: "text" as const, value: "Go to /tasks/[taskId] as the coordinator:" },
      { type: "list" as const, items: [
        "View all participant submissions",
        "Click Aggregate \u2014 downloads all updates from 0G Storage, runs FedAvg, uploads the aggregated model",
        "Task completes at 2/2 \u2014 an ERC-7857 INFT is automatically minted with the model reference",
      ]},
    ],
  },
  {
    title: "Use the Model",
    content: [
      { type: "text" as const, value: "Go to /use:" },
      { type: "list" as const, items: [
        "Select the completed model from the sidebar",
        "Upload any animal image \u2014 the model classifies it with confidence scores",
        "View INFT details: on-chain data, training metrics history, explorer links",
        "Download the model as .json (TF.js) or .pkl (Python/NumPy)",
      ]},
    ],
  },
];

export default function Home() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
      >
        <source src="/landing.mp4" type="video/mp4" />
      </video>

      {/* Instructions card */}
      <div className="absolute bottom-2 left-16 z-10">
        <div className="flex h-[28rem] w-[28rem] flex-col rounded-2xl border border-gray-200 bg-white/95 shadow-xl backdrop-blur-sm">
          {/* Header */}
          <div className="shrink-0 border-b border-gray-100 px-5 pt-5 pb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              How to Use
            </div>
            <h2 className="mt-0.5 text-xl font-bold text-gray-900">
              {current.title}
            </h2>
            {/* Step indicator */}
            <div className="mt-3 flex gap-1">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === step ? "bg-gray-900" : i < step ? "bg-gray-400" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-3">
              {current.content.map((block, i) => {
                if (block.type === "text") {
                  return (
                    <p key={i} className="text-sm leading-relaxed text-gray-600">
                      {block.value}
                    </p>
                  );
                }
                if (block.type === "code") {
                  return (
                    <pre key={i} className="overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-xs leading-relaxed text-gray-700">
                      <code>{block.value}</code>
                    </pre>
                  );
                }
                if (block.type === "list") {
                  return (
                    <ul key={i} className="space-y-2 pl-1">
                      {block.items.map((item, j) => (
                        <li key={j} className="flex gap-2 text-sm leading-relaxed text-gray-600">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:invisible"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <span className="text-xs tabular-nums text-gray-400">
              {step + 1} / {STEPS.length}
            </span>

            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === STEPS.length - 1}
              className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:invisible"
            >
              Next
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
