import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";

let brokerInstance: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;

export async function getComputeBroker() {
  if (brokerInstance) return brokerInstance;
  const privateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!privateKey) throw new Error("ZG_STORAGE_PRIVATE_KEY not set");
  const provider = new ethers.JsonRpcProvider(ZG_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  brokerInstance = await createZGComputeNetworkBroker(wallet);
  return brokerInstance;
}
