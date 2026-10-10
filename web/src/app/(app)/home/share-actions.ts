"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getActiveHomeRow } from "@/lib/homes";
import { prisma } from "@/lib/prisma";

const refresh = () => {
  revalidatePath("/home");
  revalidatePath("/you");
};

/** Publishes the active home's twin card and returns its public path. Reuses an existing link. */
export async function shareHome(): Promise<string | null> {
  const { home } = await getActiveHomeRow();
  if (!home) return null;
  const shareSlug = home.shareSlug ?? randomBytes(9).toString("base64url");
  await prisma.home.update({ where: { id: home.id }, data: { shareSlug, sharedAt: home.sharedAt ?? new Date() } });
  refresh();
  return `/t/${shareSlug}`;
}

/** Revokes the public link; the old URL stops working immediately. */
export async function unshareHome(): Promise<void> {
  const { home } = await getActiveHomeRow();
  if (!home) return;
  await prisma.home.update({ where: { id: home.id }, data: { shareSlug: null, sharedAt: null } });
  refresh();
}
