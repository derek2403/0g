import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { provider, message } = req.body;
    if (!provider || !message)
      return res.status(400).json({ error: "provider and message required" });

    const broker = await getComputeBroker();

    // Acknowledge provider if first time
    const acked = await broker.inference.acknowledged(provider);
    if (!acked) {
      await broker.inference.acknowledgeProviderSigner(provider);
    }

    // Get service metadata
    const metadata = await broker.inference.getServiceMetadata(provider);
    const { endpoint, model } = metadata;

    // Get auth headers
    const headers = await broker.inference.getRequestHeaders(
      provider,
      message
    );

    // Call provider's OpenAI-compatible endpoint
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await response.json();
    const chatID = response.headers.get("chat-id") || "";
    const usage = data.usage ? JSON.stringify(data.usage) : "";

    // Verify TEE signature
    const valid = await broker.inference.processResponse(
      provider,
      chatID,
      usage
    );

    res.json({
      success: true,
      response: data.choices?.[0]?.message?.content || "",
      model,
      provider,
      verified: valid,
      usage: data.usage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
