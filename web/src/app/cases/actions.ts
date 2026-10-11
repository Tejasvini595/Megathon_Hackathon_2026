"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { LAST_HOME_COOKIE } from "@/lib/active-home";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { CASES } from "./data";

const input = z.object({ id: z.enum(CASES.map((c) => c.id) as [string, ...string[]]) });

/** Saves the case's home as a confirmed home of the signed-in user and opens it, so Ask can be tried on it. */
export async function tryCase(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/cases");
  const parsed = input.safeParse({ id: form.get("id") });
  if (!parsed.success) redirect("/cases");
  const c = CASES.find((x) => x.id === parsed.data.id)!;

  const { postcode, ...record } = c.record;
  const home = await prisma.home.create({
    data: {
      userId: user.id,
      nickname: c.nickname,
      status: "CONFIRMED",
      postcode: typeof postcode === "string" ? postcode : null,
      record: record as unknown as Prisma.InputJsonValue,
      inputs: { create: { kind: "TEXT", text: `${c.title}: ${c.brief}` } },
    },
    select: { id: true },
  });
  (await cookies()).set(LAST_HOME_COOKIE, home.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(`/home/${home.id}`);
}
