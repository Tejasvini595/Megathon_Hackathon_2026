"use client";

import { MotionConfig, motion } from "motion/react";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import { formatGbp, scoreTone } from "@/lib/score";
import { cn } from "@/lib/utils";
import { billText } from "./format";
import type { RoutePlan } from "./route-types";

const name = (id: string) => id.replaceAll("_", " ");

export function RouteSection({ plan }: { plan: RoutePlan | null }) {
  return (
    <MotionConfig reducedMotion="user">
      <section className="mt-6">
        <h2 className="px-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Route to the next band</h2>
        {!plan || !plan.available ? (
          <p className="mt-2 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">
            {plan?.reason ?? "The engine can't plan a route for this home right now. Check the details you gave us and try again shortly."}
          </p>
        ) : (
          <Body plan={plan} />
        )}
      </section>
    </MotionConfig>
  );
}

function Body({ plan }: { plan: RoutePlan }) {
  const excluded = Object.entries(plan.excluded_by_memory ?? {});
  return (
    <div className="mt-2 space-y-3">
      <div className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
        {plan.target ? (
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="tabular text-2xl font-light" style={{ color: scoreTone(plan.current.score) }}>
              {plan.current.score}
            </span>
            <span className="text-xs text-muted-foreground">{plan.current.class}</span>
            <ArrowRight className="size-4 self-center text-muted-foreground" />
            <span className="tabular text-2xl font-light" style={{ color: scoreTone(plan.target.score) }}>
              {plan.target.score}+
            </span>
            <span className="text-xs text-muted-foreground">{plan.target.class}</span>
          </p>
        ) : (
          <p className="text-sm">Already in the top band: {plan.current.class}.</p>
        )}
        {plan.note && (
          <p className={cn("mt-2 flex items-start gap-2 text-xs", plan.reachable ? "text-muted-foreground" : "text-amber")}>
            {!plan.reachable && <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
            {plan.note}
          </p>
        )}
      </div>

      {plan.options.map((o, i) => (
        <motion.article
          key={o.retrofits.join("+")}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.05 }}
          className="rounded-3xl bg-surface p-4 ring-1 ring-hairline"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{i === 0 ? "Cheapest route" : `Option ${i + 1}`}</p>
            <p className="tabular text-sm">
              {formatGbp(o.cost_low)} to {formatGbp(o.cost_high)}
            </p>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {o.labels.map((l) => (
              <li key={l} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                {l}
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t hairline pt-3 text-sm">
            <div>
              <dt className="text-[11px] text-muted-foreground">Score after</dt>
              <dd className="tabular">
                <span style={{ color: scoreTone(o.score_after) }}>{o.score_after}</span> <span className="text-xs text-muted-foreground">{o.class_after}, EPC {o.rating_after}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Bills (estimate)</dt>
              <dd className={cn("tabular text-xs", o.bill_saving_gbp < 0 && "text-amber")}>{billText(o.bill_saving_gbp)}</dd>
            </div>
            <div className="col-span-2 text-xs text-muted-foreground">
              {o.payback_years == null ? "Doesn't pay back at today's prices." : <span className="tabular">Pays back in about {o.payback_years.toFixed(1)} years.</span>}
            </div>
          </dl>
          {o.electricity_rises && <p className="mt-2 rounded-2xl bg-amber/10 px-3 py-2 text-xs text-amber">Electricity use rises with this route because it swaps gas for electric heat. Net carbon still falls.</p>}
        </motion.article>
      ))}

      {plan.options.length === 0 && plan.target && <p className="px-1 text-xs text-muted-foreground">No combination of the measures left reaches the next band.</p>}

      {(plan.memory_notes?.length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {plan.memory_notes!.map((n) => (
            <li key={n} className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-frost" />
              {n}
            </li>
          ))}
        </ul>
      )}

      {excluded.length > 0 && (
        <div className="rounded-3xl bg-surface px-4 py-3 ring-1 ring-hairline">
          <p className="text-xs font-medium">Left out because of what you told us</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {excluded.map(([id, why]) => (
              <li key={id}>
                <span className="capitalize">{name(id)}</span>
                <span className="text-muted-foreground">: {why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">Costs and savings are engine estimates, not quotes or guarantees.</p>
    </div>
  );
}
