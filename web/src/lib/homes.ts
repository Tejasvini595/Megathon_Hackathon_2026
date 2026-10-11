import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { LAST_HOME_COOKIE, type HomeSection } from "@/lib/active-home";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { getTwin } from "@/lib/engine";
import { deleteUploads } from "@/lib/storage";

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
  const lastId = cookieStore.get(LAST_HOME_COOKIE)?.value;
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

/** The signed-in user and the home in the URL; 404 when it isn't theirs. */
export const getOwnedHome = cache(async (id: string) => {
  const user = await requireUser();
  const home = await prisma.home.findFirst({ where: { id, userId: user.id } });
  if (!home) notFound();
  return { user, home };
});

/** As above plus the engine's twin for that home. */
export async function getOwnedHomeTwin(id: string) {
  const { user, home } = await getOwnedHome(id);
  return { user, home, twin: await getTwin(home) };
}

/** For a bare section URL: redirects to that section of the last-opened home. Returns the user when they have no homes. */
export async function redirectToActiveHome(section: HomeSection) {
  const { user, home } = await getActiveHomeRow();
  if (home) redirect(`/${section}/${home.id}`);
  return user;
}


/** Deletes one of the user's homes (optionally only drafts) with its uploaded files. Returns false if there was no match. */
export async function removeOwnedHome(userId: string, id: string, draftOnly = false) {
  const home = await prisma.home.findFirst({
    where: { id, userId, ...(draftOnly && { status: "DRAFT" as const }) },
    select: { id: true, inputs: { select: { fileUrl: true } } },
  });
  if (!home) return false;
  await prisma.home.delete({ where: { id: home.id } });
  await deleteUploads(home.inputs.flatMap((i) => (i.fileUrl ? [i.fileUrl] : [])));
  return true;
}
