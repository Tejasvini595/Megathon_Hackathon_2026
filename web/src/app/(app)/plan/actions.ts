"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { parseMemory, retrofitId, type Memory } from "@/lib/memory";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const homeId = z.string().min(1).max(64);
const reason = z.string().trim().max(200).optional();
const profile = z.object({
  renting: z.boolean().optional(),
  listed: z.boolean().optional(),
  budget_gbp: z.number().int().min(0).max(100_000).nullable().optional(),
  priority: z.enum(["carbon", "cost"]).nullable().optional(),
});

const name = (id: string) => id.replaceAll("_", " ");
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/** Re-checks the session and ownership, applies `change` to the home's memory and logs what it said. */
async function update(id: string, change: (m: Memory) => string | null) {
  const user = await requireUser();
  const home = await prisma.home.findFirst({ where: { id: homeId.parse(id), userId: user.id }, select: { id: true, memory: true } });
  if (!home) return;
  const memory = parseMemory(home.memory);
  const text = change(memory);
  if (!text) return;
  memory.log = [...memory.log, { at: new Date().toISOString(), text }].slice(-100);
  await prisma.home.update({ where: { id: home.id }, data: { memory: memory as unknown as Prisma.InputJsonValue } });
  revalidatePath("/plan");
  revalidatePath("/you");
}

export async function markDone(id: string, measure: string) {
  const m = retrofitId.parse(measure);
  await update(id, (mem) => {
    if (mem.completed.includes(m)) return null;
    mem.completed.push(m);
    delete mem.declined[m];
    return `You said ${name(m)} is already done: your plan now starts from the improved home.`;
  });
}

export async function markDeclined(id: string, measure: string, why?: string) {
  const m = retrofitId.parse(measure);
  const r = reason.parse(why) || "Not for me";
  await update(id, (mem) => {
    mem.declined[m] = r;
    mem.completed = mem.completed.filter((c) => c !== m);
    return `You ruled out ${name(m)} (${r}): it is left out of the route.`;
  });
}

export async function clearMeasure(id: string, measure: string) {
  const m = retrofitId.parse(measure);
  await update(id, (mem) => {
    if (!mem.completed.includes(m) && !(m in mem.declined)) return null;
    mem.completed = mem.completed.filter((c) => c !== m);
    delete mem.declined[m];
    return `You put ${name(m)} back on the table.`;
  });
}

export async function saveProfile(id: string, input: z.input<typeof profile>) {
  const p = profile.parse(input);
  await update(id, (mem) => {
    const lines: string[] = [];
    if (p.renting !== undefined && p.renting !== mem.renting) {
      mem.renting = p.renting;
      lines.push(p.renting ? "You said you rent: only measures a tenant can make are suggested." : "You said you own the home: structural work is considered again.");
    }
    if (p.listed !== undefined && p.listed !== mem.listed) {
      mem.listed = p.listed;
      lines.push(p.listed ? "You said the home is listed or in a conservation area: measures that need consent are left out." : "You said there are no listing restrictions.");
    }
    if (p.budget_gbp !== undefined && p.budget_gbp !== mem.budget_gbp) {
      mem.budget_gbp = p.budget_gbp;
      lines.push(p.budget_gbp == null ? "You removed your budget limit." : `You set a budget of ${gbp(p.budget_gbp)}: routes are capped to it.`);
    }
    if (p.priority !== undefined && p.priority !== mem.priority) {
      mem.priority = p.priority;
      lines.push(p.priority == null ? "You have no preference between carbon and cost." : `You prioritise ${p.priority === "carbon" ? "carbon" : "cost"}.`);
    }
    return lines.length ? lines.join(" ") : null;
  });
}
