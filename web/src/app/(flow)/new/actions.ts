"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/dal";
import { extract, type ExtractInput } from "@/lib/extract";
import { FIELDS, type ExtractionResult } from "@/lib/extract/fields";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/storage";

const MAX_FILE = 15 * 1024 * 1024;

export type CaptureResult = { ok: true; homeId: string; extraction: ExtractionResult } | { ok: false; error: string };

/** Free-form capture: any mix of description, voice transcript, photos, plans and an optional postcode. */
export async function createHome(form: FormData): Promise<CaptureResult> {
  const user = await requireUser();

  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  const voice = String(form.get("voice") ?? "").trim().slice(0, 4000);
  const postcode = String(form.get("postcode") ?? "").trim().toUpperCase().slice(0, 10) || null;
  const files = (name: string) => form.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
  const photos = files("photos").filter((f) => f.type.startsWith("image/"));
  const plans = files("plans").filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");

  if (!text && !voice && !postcode && photos.length + plans.length === 0) return { ok: false, error: "Tell us something about the home first." };
  if ([...photos, ...plans].some((f) => f.size > MAX_FILE)) return { ok: false, error: "Files must be under 15 MB." };

  const inputs: ExtractInput[] = [];
  if (text) inputs.push({ kind: "TEXT", text });
  if (voice) inputs.push({ kind: "VOICE", text: voice });
  if (postcode) inputs.push({ kind: "POSTCODE", text: postcode });
  for (const [kind, list] of [["PHOTO", photos], ["PLAN", plans]] as const)
    for (const f of list) inputs.push({ kind, fileUrl: await saveUpload(f), mimeType: f.type });

  const extraction = await extract(inputs);

  const home = await prisma.home.create({
    data: {
      userId: user.id,
      postcode,
      inputs: { create: inputs.map(({ kind, text, fileUrl, mimeType }) => ({ kind, text, fileUrl, mimeType })) },
      extractions: {
        create: {
          status: "DONE",
          models: extraction.models,
          fields: extraction.fields as unknown as Prisma.InputJsonValue,
          conflicts: extraction.conflicts as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true },
  });

  return { ok: true, homeId: home.id, extraction };
}

const recordSchema = z.object(
  Object.fromEntries(
    FIELDS.map((f) => [
      f.key,
      f.kind === "number" ? z.coerce.number().min(f.min).max(f.max) : z.enum(f.options.map((o) => o.value) as [string, ...string[]]),
    ]),
  ),
);

const confirmSchema = z.object({ nickname: z.string().trim().min(1).max(60), record: recordSchema });

/** The user confirms (or corrects) the extracted record. Only now does the engine see it. */
export async function confirmHome(homeId: string, input: z.input<typeof confirmSchema>): Promise<{ error: string }> {
  const user = await requireUser();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { error: z.prettifyError(parsed.error) };

  const { count } = await prisma.home.updateMany({
    where: { id: homeId, userId: user.id },
    data: { status: "CONFIRMED", nickname: parsed.data.nickname, record: parsed.data.record },
  });
  if (count === 0) return { error: "That home no longer exists." };
  redirect("/home");
}
