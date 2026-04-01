import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { action, amount, provider, serviceType } = req.body;
    const broker = await getComputeBroker();

    switch (action) {
      case "create-ledger": {
        await broker.ledger.addLedger(amount);
        return res.json({ success: true, message: "Ledger created" });
      }
      case "deposit": {
        await broker.ledger.depositFund(amount);
        return res.json({ success: true, message: "Funds deposited" });
      }
      case "transfer": {
        const neuron = BigInt(Math.floor(parseFloat(amount) * 1e18));
        await broker.ledger.transferFund(
          provider,
          serviceType || "inference",
          neuron
        );
        return res.json({ success: true, message: "Funds transferred" });
      }
      case "get-balance": {
        const ledger = await broker.ledger.getLedger();
        return res.json({ success: true, ledger });
      }
      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
