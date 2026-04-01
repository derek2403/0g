import type { NextApiRequest, NextApiResponse } from "next";
import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import { ZG_INDEXER, ZG_RPC } from "@/lib/config";
import { encrypt } from "@/lib/encrypt";
import fs from "fs";
import os from "os";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "50mb" } } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { content, encrypted } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });

    const privateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
    if (!privateKey)
      return res.status(500).json({ error: "ZG_STORAGE_PRIVATE_KEY not set" });

    const finalContent = encrypted ? encrypt(content) : content;

    // Write to temp file for ZgFile
    const tmpFile = path.join(os.tmpdir(), `fl-upload-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, finalContent, "utf-8");

    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) {
      fs.unlinkSync(tmpFile);
      return res.status(500).json({ error: "Failed to build merkle tree" });
    }
    const rootHash = tree.rootHash();

    const provider = new ethers.JsonRpcProvider(ZG_RPC);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(ZG_INDEXER);

    const [txHash, uploadErr] = await indexer.upload(zgFile, ZG_RPC, signer);
    await zgFile.close();
    fs.unlinkSync(tmpFile);

    if (uploadErr)
      return res.status(500).json({ error: `Upload failed: ${uploadErr}` });

    res.json({
      success: true,
      rootHash: rootHash,
      txHash: txHash,
      contentLength: finalContent.length,
      encrypted: !!encrypted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
