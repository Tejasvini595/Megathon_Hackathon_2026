"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { removeOwnedHome } from "@/lib/homes";

/** Throws away an unconfirmed home and its uploads. Confirmed homes are never touched. */
export async function discardDraft(id: string): Promise<void> {
  const user = await requireUser();
  if (await removeOwnedHome(user.id, z.string().min(1).max(64).parse(id), true)) revalidatePath("/you");
}
