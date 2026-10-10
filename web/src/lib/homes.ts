import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { getTwin } from "@/lib/engine";

/** The signed-in user's most recent confirmed home and its twin, or null if they have none yet. */
export async function getActiveHome() {
  const user = await requireUser();
  const home = await prisma.home.findFirst({
    where: { userId: user.id, status: "CONFIRMED" },
    orderBy: { updatedAt: "desc" },
  });
  if (!home) return { user, home: null, twin: null } as const;
  const twin = await getTwin(home);
  return { user, home, twin } as const;
}
