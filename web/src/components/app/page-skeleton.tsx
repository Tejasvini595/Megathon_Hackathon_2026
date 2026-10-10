export function PageSkeleton() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6">
      <div className="size-44 rounded-full bg-volt/10 blur-2xl animate-breathe" />
      <div className="shimmer h-3 w-40 rounded-full" />
    </div>
  );
}
