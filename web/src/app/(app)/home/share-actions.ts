"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

const homeId = z.string().min(1).max(64);

const refresh = () => {
  revalidatePath("/home");
  revalidatePath("/you");
};

/** Publishes this home's twin card (only the owner's, only once confirmed) and returns its public path. Reuses an existing link. */
export async function shareHome(id: string): Promise<string | null> {
  const user = await requireUser();
  const home = await prisma.home.findFirst({ where: { id: homeId.parse(id), userId: user.id, status: "CONFIRMED" } });
  if (!home) return null;
  const shareSlug = home.shareSlug ?? randomBytes(9).toString("base64url");
  await prisma.home.update({ where: { id: home.id }, data: { shareSlug, sharedAt: home.sharedAt ?? new Date() } });
  refresh();
  return `/t/${shareSlug}`;
}

/** Revokes the public link; the old URL stops working immediately. */
export async function unshareHome(id: string): Promise<void> {
  const user = await requireUser();
  await prisma.home.updateMany({ where: { id: homeId.parse(id), userId: user.id }, data: { shareSlug: null, sharedAt: null } });
  refresh();
}
