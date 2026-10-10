import { HomeSheetSkeleton } from "./home-sheet";

export function HomeSkeleton() {
  return (
    <div className="w-full">
      {/* Top stage skeleton with subtle pulsing glow */}
      <section className="sticky top-0 h-[64dvh] min-h-[420px] w-full flex items-center justify-center">
        {/* Pulsing glow behind house */}
        <div className="absolute size-64 rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)] animate-breathe" />

        {/* Minimalist house wireframe placeholder */}
        <div className="relative flex flex-col items-center gap-3 text-muted-foreground/40">
          <svg viewBox="0 0 120 90" className="h-24 w-auto stroke-current" fill="none" aria-hidden>
            <path d="M14 44 60 10l46 34" strokeWidth="2" strokeLinejoin="round" />
            <path d="M24 38v42h72V38" strokeWidth="2" strokeLinejoin="round" />
            <rect x="36" y="50" width="14" height="12" rx="1.5" strokeWidth="1.5" />
            <rect x="70" y="50" width="14" height="12" rx="1.5" strokeWidth="1.5" />
            <path d="M55 80V64h10v16" strokeWidth="1.5" />
          </svg>
          <div className="shimmer h-3 w-32 rounded-full" />
        </div>

        {/* Header placeholder */}
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-safe">
          <div className="pt-3">
            <div className="glass flex items-center gap-2 rounded-full px-4 py-2 border-white/10">
              <span className="size-2 rounded-full bg-volt/50 animate-pulse" />
              <div className="shimmer h-4 w-24 rounded-full" />
            </div>
            <div className="shimmer mt-2 ml-1 h-3 w-16 rounded-full" />
          </div>
          <div className="glass mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 border-white/10">
            <div className="shimmer h-3 w-12 rounded-full" />
          </div>
        </header>
      </section>

      {/* Sheet skeleton */}
      <section className="relative z-10 -mt-10 rounded-t-[32px] border-t hairline bg-background px-5 pb-40 pt-3">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-2" />
        <HomeSheetSkeleton />
      </section>
    </div>
  );
}
