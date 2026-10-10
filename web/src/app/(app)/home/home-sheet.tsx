"use client";

import { useTwinView } from "@/components/twin/twin-view";
import { cn } from "@/lib/utils";

export function HomeSheet({ children }: { children: React.ReactNode }) {
  const { isSwitching } = useTwinView();

  return (
    <section className="relative z-10 -mt-10 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-3">
      {/* The handle doubles as a quiet loading indicator when switching homes. */}
      <div className={cn("mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2 transition-all duration-300", isSwitching && "w-16 shimmer")} />
      <div aria-busy={isSwitching} className={cn("transition-opacity duration-300", isSwitching && "pointer-events-none opacity-40")}>
        {children}
      </div>
    </section>
  );
}

export function HomeSheetSkeleton() {
  return (
    <div className="space-y-4">
      {/* Score and confidence skeleton */}
      <div className="flex items-center gap-5">
        <div className="size-24 shrink-0 rounded-full border-4 border-surface-2 bg-surface flex items-center justify-center">
          <div className="shimmer h-7 w-12 rounded-lg" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="space-y-1.5">
            <div className="shimmer h-3 w-28 rounded-full" />
            <div className="shimmer h-4 w-44 rounded-full" />
          </div>
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full bg-surface-2 shimmer" />
              ))}
            </div>
            <div className="shimmer h-2.5 w-24 rounded-full" />
          </div>
        </div>
      </div>

      {/* Heat loss card skeleton */}
      <div className="mt-7 rounded-3xl bg-surface p-4 ring-1 ring-hairline space-y-3">
        <div className="flex justify-between items-center mb-2">
          <div className="shimmer h-4 w-36 rounded-full" />
          <div className="shimmer h-3 w-24 rounded-full" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-1.5 py-1">
            <div className="flex justify-between">
              <div className="shimmer h-3 w-16 rounded-full" />
              <div className="shimmer h-3 w-8 rounded-full" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-2 shimmer" />
          </div>
        ))}
      </div>

      {/* Stats carousel skeleton */}
      <div className="-mx-5 flex gap-3 overflow-hidden px-5 pt-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="min-w-[132px] rounded-3xl bg-surface p-4 ring-1 ring-hairline space-y-2">
            <div className="size-4 rounded bg-surface-2 shimmer" />
            <div className="shimmer h-7 w-20 rounded-lg mt-3" />
            <div className="shimmer h-3 w-16 rounded-full mt-2" />
          </div>
        ))}
      </div>

      {/* Recommended action skeleton */}
      <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline space-y-2.5">
        <div className="shimmer h-3 w-20 rounded-full" />
        <div className="shimmer h-5 w-48 rounded-full" />
        <div className="shimmer h-3.5 w-full rounded-full" />
      </div>

      {/* Why this score skeleton */}
      <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline space-y-3">
        <div className="shimmer h-4 w-28 rounded-full" />
        <div className="h-2.5 w-full rounded-full bg-surface-2 shimmer" />
      </div>
    </div>
  );
}
