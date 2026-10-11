import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getTwin } from "@/lib/engine";
import { prisma } from "@/lib/prisma";

const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{10,64}$/);

/**
 * The live twin for a public slug, or null if unknown, revoked or unconfirmed. Selects only what
 * the card shows; the postcode only goes to the engine (for the climate region), and the address, raw inputs
 * and home id never reach the page.
 */
export const getSharedTwin = cache(async (slug: string) => {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const home = await prisma.home.findUnique({
    where: { shareSlug: parsed.data },
    select: { id: true, nickname: true, record: true, status: true, footprint: true, postcode: true, twin: true, twinKey: true, memory: true },
  });
  if (!home || home.status !== "CONFIRMED") return null;
  const twin = await getTwin(home);
  return { record: home.record, twin: { ...twin, postcode: null } };
});
