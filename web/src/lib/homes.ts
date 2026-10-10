import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { getTwin } from "@/lib/engine";

/** The signed-in user and their active home (by specified homeId, or last_home_id cookie, or latest home). */
export const getActiveHomeRow = cache(async (homeId?: string) => {
  const user = await requireUser();

  if (homeId) {
    const home = await prisma.home.findFirst({
      where: { id: homeId, userId: user.id },
    });
    if (home) return { user, home };
  }

  const cookieStore = await cookies();
  const lastId = cookieStore.get("last_home_id")?.value;
  if (lastId) {
    const home = await prisma.home.findFirst({
      where: { id: lastId, userId: user.id },
    });
    if (home) return { user, home };
  }

  let home = await prisma.home.findFirst({
    where: { userId: user.id, status: "CONFIRMED" },
    orderBy: { updatedAt: "desc" },
  });

  if (!home) {
    home = await prisma.home.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
  }

  return { user, home };
});

/** As above plus the engine's twin for that home, or null if they have none yet. */
export async function getActiveHome(homeId?: string) {
  const { user, home } = await getActiveHomeRow(homeId);
  if (!home) return { user, home: null, twin: null } as const;
  return { user, home, twin: await getTwin(home) } as const;
}

