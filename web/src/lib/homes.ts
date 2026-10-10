import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { getTwin } from "@/lib/engine";

/** The signed-in user and their most recent confirmed home (deduped per request). */
export const getActiveHomeRow = cache(async () => {
  const user = await requireUser();
  const home = await prisma.home.findFirst({
    where: { userId: user.id, status: "CONFIRMED" },
    orderBy: { updatedAt: "desc" },
  });
  return { user, home };
});

/** As above plus the engine's twin for that home, or null if they have none yet. */
export async function getActiveHome() {
  const { user, home } = await getActiveHomeRow();
  if (!home) return { user, home: null, twin: null } as const;
  return { user, home, twin: await getTwin(home) } as const;
}
