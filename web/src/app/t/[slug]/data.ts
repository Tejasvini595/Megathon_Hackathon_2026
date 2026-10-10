import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getTwin } from "@/lib/engine";
import { prisma } from "@/lib/prisma";

const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{10,64}$/);

/**
 * The live twin for a public slug, or null if unknown, revoked or unconfirmed. Selects only what
 * the card shows; ids, postcode, address and raw inputs never leave the database. The slug stands
 * in for the home id when asking the engine.
 */
export const getSharedTwin = cache(async (slug: string) => {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const home = await prisma.home.findUnique({
    where: { shareSlug: parsed.data },
    select: { nickname: true, record: true, status: true },
  });
  if (!home || home.status !== "CONFIRMED") return null;
  return { record: home.record, twin: await getTwin({ id: parsed.data, nickname: home.nickname, postcode: null, record: home.record }) };
});
