export function PageSkeleton() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6">
      <div className="size-44 animate-breathe rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)]" />
      <div className="shimmer h-3 w-40 rounded-full" />
    </div>
  );
}
