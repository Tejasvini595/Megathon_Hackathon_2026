import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FIELDS } from "@/lib/extract/fields";

const recordSchema = z.object(
  Object.fromEntries(
    FIELDS.map((f) => [
      f.key,
      f.kind === "number" ? z.coerce.number().min(f.min).max(f.max) : z.enum(f.options.map((o) => o.value) as [string, ...string[]]),
    ]),
  ),
);

const bodySchema = z.object({
  nickname: z.string().trim().min(1).max(60).optional(),
  record: recordSchema,
});

/** The user confirms (or corrects) the extracted record. Only now does the engine see it. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/homes/[id]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { id } = await ctx.params;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const home = await prisma.home.findFirst({ where: { id, userId: session.user.id } });
  if (!home) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.home.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      record: { ...parsed.data.record, postcode: home.postcode },
      ...(parsed.data.nickname ? { nickname: parsed.data.nickname } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
