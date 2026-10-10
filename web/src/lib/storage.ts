import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local disk for the hackathon. Swap for S3/R2 by replacing these two functions.
const ROOT = path.join(process.cwd(), "storage", "uploads");

export async function saveUpload(file: File): Promise<string> {
  await mkdir(ROOT, { recursive: true });
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const key = `${randomUUID()}.${ext}`;
  await writeFile(path.join(ROOT, key), Buffer.from(await file.arrayBuffer()));
  return key;
}

export async function readUpload(key: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(key)) throw new Error("bad key");
  return readFile(path.join(ROOT, key));
}

export async function deleteUploads(keys: string[]): Promise<void> {
  await Promise.all(
    keys
      .filter((k) => /^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(k))
      .map((k) => rm(path.join(ROOT, k), { force: true })),
  );
}
