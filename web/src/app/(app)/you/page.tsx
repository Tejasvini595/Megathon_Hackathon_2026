import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Link2Off, LogOut, Plus } from "lucide-react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { requireUser } from "@/lib/dal";
import { getActiveHomeRow } from "@/lib/homes";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { unshareHome } from "../home/share-actions";
import { signOutAction } from "./actions";
import { HomeMenu } from "./home-menu";

export const metadata: Metadata = { title: "You" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const user = await requireUser();
  const homes = await prisma.home.findMany({ where: { userId: user.id }, include: { _count: { select: { extractions: true } } }, orderBy: { updatedAt: "desc" } });
  const { home: activeHome } = await getActiveHomeRow();
  const activeHomeId = activeHome?.id;
  const shared = homes.filter((h) => h.shareSlug);

  return (
    <div className="px-5 pt-safe pb-40">
      <div className="flex items-center gap-4 pt-6">
        <div className="grid size-16 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#d8fff0,var(--volt)_50%,#0e6b4f)] text-2xl font-semibold text-black">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <h2 className="mb-2 mt-8 px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Your homes</h2>
      <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline">
        {homes.map((h, i) => {
          const isActive = h.id === activeHomeId;
          return (
            <div key={h.id} className={cn("flex items-center transition-colors hover:bg-surface-2", i > 0 && "border-t hairline")}>
              <Link href={`/home?homeId=${h.id}`} className="group flex min-w-0 flex-1 items-center justify-between gap-3 py-3.5 pl-4 pr-2 active:scale-[0.99]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate group-hover:text-foreground transition-colors">{h.nickname}</p>
                    {isActive && (
                      <span className="rounded-full bg-volt/15 px-2 py-0.5 text-[10px] font-semibold text-volt">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {h.status === "CONFIRMED" ? "Twin ready" : "Draft, not confirmed"}
                    {h.postcode ? ` · ${h.postcode}` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-foreground shrink-0" />
              </Link>
              <HomeMenu id={h.id} nickname={h.nickname} draft={h.status !== "CONFIRMED"} editHref={h.record || h._count.extractions ? `/edit/${h.id}` : null} />
            </div>
          );
        })}
        <Link href="/new" className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-volt hover:bg-surface-2 transition-colors ${homes.length ? "border-t hairline" : ""}`}>
          <Plus className="size-4 text-volt" /> Add a home
        </Link>
      </div>

      {shared.map((h) => (
        <form key={h.id} action={unshareHome.bind(null, h.id)} className="mt-3 flex items-center gap-3 rounded-3xl bg-surface px-4 py-3.5 ring-1 ring-hairline">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{h.nickname}: twin card is public</p>
            <p className="truncate text-xs text-muted-foreground">/t/{h.shareSlug}</p>
          </div>
          <button type="submit" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-destructive ring-1 ring-hairline">
            <Link2Off className="size-3.5" /> Stop sharing
          </button>
        </form>
      ))}

      <h2 className="mb-2 mt-8 px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Memory</h2>
      <div className="rounded-3xl border border-dashed hairline p-5 text-sm text-muted-foreground">
        Preferences and constraints you mention (renting, listed building, no heat pump, budget) will appear here and shape your plan.
      </div>

      <form action={signOutAction} className="mt-8">
        <button type="submit" className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left text-sm text-destructive ring-1 ring-hairline">
          <LogOut className="size-4" /> Sign out
        </button>
      </form>
    </div>
  );
}
