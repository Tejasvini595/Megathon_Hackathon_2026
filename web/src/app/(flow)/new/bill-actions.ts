"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { checkBill, type Finding } from "@/lib/extract/bill-checks";
import type { EnergyUsage } from "@/lib/extract/fields";
import { BILL_MEDIA_TYPES, readBills } from "@/lib/llm/bill";
import { llmEnabled } from "@/lib/llm/provider";

export type BillResult =
  | { status: "ok"; usage: EnergyUsage | null; findings: Finding[]; source: string }
  | { status: "unavailable" | "error"; message: string };

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 4;

const input = z.object({
  files: z.array(z.instanceof(File).refine((f) => f.size > 0 && f.size <= MAX_BYTES, "Each file must be under 10 MB").refine((f) => (BILL_MEDIA_TYPES as readonly string[]).includes(f.type), "Use a photo (JPEG, PNG, WebP, HEIC) or a PDF")).min(1, "Add a bill").max(MAX_FILES, `At most ${MAX_FILES} files`),
  heating: z.string().max(40).optional(),
});

/**
 * Reads usage off bills the user photographed or uploaded. The files live only in this request: they are read in memory,
 * sent to the vision model and dropped. The model transcribes; the findings come from our own checks.
 */
export async function readBill(form: FormData): Promise<BillResult> {
  await requireUser();
  if (!llmEnabled()) return { status: "unavailable", message: "Bill reading isn't set up on this server yet. Upload a CSV or type your readings instead." };
  const parsed = input.safeParse({ files: form.getAll("files"), heating: form.get("heating") ?? undefined });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  try {
    const reading = await readBills(await Promise.all(parsed.data.files.map(async (f) => ({ data: new Uint8Array(await f.arrayBuffer()), mediaType: f.type }))));
    const { usage, findings } = checkBill(reading, { heating: parsed.data.heating });
    const n = parsed.data.files.length;
    return { status: "ok", usage, findings, source: `${n} bill${n === 1 ? "" : "s"}` };
  } catch {
    return { status: "error", message: "We couldn't read that. Try a clearer, well-lit photo, or type the readings instead." };
  }
}
