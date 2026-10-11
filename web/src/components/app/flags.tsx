import { FlaskConical, Info, TriangleAlert } from "lucide-react";
import type { TwinState } from "@/lib/twin/types";

/** Shown whenever the figures come from the fixture rather than the engine. */
export function ExampleBanner({ twin }: { twin: Pick<TwinState, "modelVersion"> }) {
  if (twin.modelVersion !== "mock") return null;
  return (
    <div role="status" className="mb-5 flex items-start gap-2 rounded-2xl bg-amber/10 px-3.5 py-2.5 text-xs text-amber ring-1 ring-amber/25">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-semibold">Example data, engine not connected.</span> Figures are illustrative; your home&apos;s shape is real.
      </span>
    </div>
  );
}

export function FlagList({ twin, className }: { twin: Pick<TwinState, "flags" | "modelVersion">; className?: string }) {
  // The banner already says it; don't repeat the fixture's own flag.
  const flags = twin.modelVersion === "mock" ? twin.flags.filter((f) => !f.message.startsWith("Example data")) : twin.flags;
  if (flags.length === 0) return null;
  return (
    <ul className={className}>
      {flags.map((f) => {
        const Icon = f.severity === "warn" ? TriangleAlert : Info;
        return (
          <li key={f.field + f.message} className="flex items-start gap-2 py-1 text-xs text-muted-foreground">
            <Icon className={f.severity === "warn" ? "mt-0.5 size-3.5 shrink-0 text-amber" : "mt-0.5 size-3.5 shrink-0 text-frost"} />
            {f.message}
          </li>
        );
      })}
    </ul>
  );
}
