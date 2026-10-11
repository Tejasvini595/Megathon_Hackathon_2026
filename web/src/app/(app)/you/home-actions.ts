"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LAST_HOME_COOKIE } from "@/lib/active-home";
import { requireUser } from "@/lib/dal";
import { removeOwnedHome } from "@/lib/homes";
import { prisma } from "@/lib/prisma";

const homeId = z.string().min(1).max(64);
const nicknameSchema = z.string().trim().min(1).max(60);

const refresh = (id: string) => {
  revalidatePath(`/home/${id}`);
  revalidatePath("/you");
};

export async function renameHome(id: string, nickname: string): Promise<{ error: string } | null> {
  const user = await requireUser();
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) return { error: "Use 1 to 60 characters." };
  const { count } = await prisma.home.updateMany({ where: { id: homeId.parse(id), userId: user.id }, data: { nickname: parsed.data } });
  if (count === 0) return { error: "That home no longer exists." };
  refresh(id);
  return null;
}

export async function deleteHome(id: string): Promise<void> {
  const user = await requireUser();
  const parsed = homeId.parse(id);
  if (!(await removeOwnedHome(user.id, parsed))) return;
  const cookieStore = await cookies();
  if (cookieStore.get(LAST_HOME_COOKIE)?.value === parsed) cookieStore.delete(LAST_HOME_COOKIE);
  refresh(id);
}
