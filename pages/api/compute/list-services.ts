import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const broker = await getComputeBroker();
    const services = await broker.inference.listService(0, 50, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = services.map((s: any) => ({
      provider: s.provider,
      model: s.model,
      serviceType: s.serviceType,
      url: s.url,
      inputPrice: s.inputPrice,
      outputPrice: s.outputPrice,
      verifiability: s.verifiability,
    }));

    res.json({ success: true, services: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
