import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/storage";
import { extract, type ExtractInput } from "@/lib/extract";
import type { Prisma } from "@/generated/prisma/client";

const MAX_FILE = 15 * 1024 * 1024;

/** Free-form capture: any mix of description, voice transcript, photos, plans and an optional postcode. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const form = await request.formData();
  const text = String(form.get("text") ?? "").trim();
  const voice = String(form.get("voice") ?? "").trim();
  const postcode = String(form.get("postcode") ?? "").trim().toUpperCase() || null;
  const photos = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const plans = form.getAll("plans").filter((f): f is File => f instanceof File && f.size > 0);

  if (!text && !voice && !postcode && photos.length + plans.length === 0)
    return NextResponse.json({ error: "Tell us something about the home first." }, { status: 400 });
  if ([...photos, ...plans].some((f) => f.size > MAX_FILE))
    return NextResponse.json({ error: "Files must be under 15 MB." }, { status: 413 });

  const inputs: ExtractInput[] = [];
  const rows: Prisma.HomeInputCreateWithoutHomeInput[] = [];
  if (text) {
    inputs.push({ kind: "TEXT", text });
    rows.push({ kind: "TEXT", text });
  }
  if (voice) {
    inputs.push({ kind: "VOICE", text: voice });
    rows.push({ kind: "VOICE", text: voice });
  }
  if (postcode) {
    inputs.push({ kind: "POSTCODE", text: postcode });
    rows.push({ kind: "POSTCODE", text: postcode });
  }
  for (const [kind, files] of [["PHOTO", photos], ["PLAN", plans]] as const) {
    for (const f of files) {
      const key = await saveUpload(f);
      inputs.push({ kind, fileUrl: key, mimeType: f.type });
      rows.push({ kind, fileUrl: key, mimeType: f.type });
    }
  }

  const result = await extract(inputs);

  const home = await prisma.home.create({
    data: {
      userId: session.user.id,
      postcode,
      inputs: { create: rows },
      extractions: {
        create: {
          status: "DONE",
          models: result.models,
          fields: result.fields as unknown as Prisma.InputJsonValue,
          conflicts: result.conflicts as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { inputs: { select: { id: true, kind: true } } },
  });

  return NextResponse.json({ homeId: home.id, inputs: home.inputs, extraction: result });
}
