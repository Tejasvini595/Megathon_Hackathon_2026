import type { Memory } from "@/lib/memory";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function MemoryTimeline({ log }: { log: Memory["log"] }) {
  return (
    <section className="mt-6">
      <h2 className="px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">How your plan changed</h2>
      {log.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed hairline px-3.5 py-3 text-xs text-muted-foreground">
          Nothing yet. Mark a measure as done, rule one out, or fill in &quot;About you&quot;, and each change is recorded here with its effect on the route.
        </p>
      ) : (
        <ol className="relative mt-3 space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-hairline">
          {[...log].reverse().map((e) => (
            <li key={e.at + e.text} className="relative pl-6 text-sm">
              <span className="absolute left-0 top-1.5 size-[11px] rounded-full bg-volt ring-4 ring-background" />
              {e.text}
              <time dateTime={e.at} className="block text-[11px] text-muted-foreground">
                {when.format(new Date(e.at))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
