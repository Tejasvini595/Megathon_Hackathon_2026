import { cn } from "@/lib/utils";

export function Section({ id, title, hint, className, children }: { id: string; title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("mt-4 rounded-3xl bg-surface p-4 ring-1 ring-hairline", className)}>
      <div className="mb-3">
        <h2 id={id} className="text-sm font-medium">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export const th = "py-1.5 pr-3 text-left text-[11px] font-normal text-muted-foreground";
export const td = "tabular py-1.5 pr-3 align-top text-xs";
