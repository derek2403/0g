import type { NextApiRequest, NextApiResponse } from "next";
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { ZG_INDEXER } from "@/lib/config";
import { decrypt } from "@/lib/encrypt";
import fs from "fs";
import os from "os";
import path from "path";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rootHash, encrypted } = req.body;
    if (!rootHash) return res.status(400).json({ error: "rootHash required" });

    const indexer = new Indexer(ZG_INDEXER);
    const tmpFile = path.join(os.tmpdir(), `fl-download-${Date.now()}.json`);

    const downloadErr = await indexer.download(rootHash, tmpFile, true);
    if (downloadErr) {
      return res.status(500).json({ error: `Download failed: ${downloadErr}` });
    }

    let content = fs.readFileSync(tmpFile, "utf-8");
    fs.unlinkSync(tmpFile);

    if (encrypted) {
      content = decrypt(content);
    }

    res.json({
      success: true,
      content,
      contentLength: content.length,
      decrypted: !!encrypted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
