import { ArrowDownWideNarrow } from "lucide-react";
import type { RetrofitId } from "@/lib/twin/types";

const FABRIC: RetrofitId[] = ["loft_insulation", "cavity_wall_insulation", "solid_wall_insulation", "floor_insulation", "double_glazing"];

/**
 * Why the steps come in this order: the engine applies fabric first and counts each step's saving on top of the ones
 * before it, so heating is sized to a smaller demand and the steps add up to the package rather than double counting.
 */
export function WhyThisOrder({ ids }: { ids: RetrofitId[] }) {
  const fabric = ids.some((id) => FABRIC.includes(id));
  const parts = [
    fabric && "insulation and glazing come first because they shrink how much heat the home needs",
    ids.includes("smart_thermostat") && "controls then trim how long the heating runs",
    ids.includes("heat_pump") && "the heat pump comes after, sized to the smaller demand (it works better in a well-insulated home)",
    ids.includes("condensing_boiler") && "a new boiler then heats what's left more efficiently",
    ids.includes("solar_pv") && `solar comes last${ids.includes("heat_pump") ? ", offsetting some of the heat pump's extra electricity" : ", cutting the electricity you buy"}`,
  ].filter(Boolean) as string[];
  if (parts.length < 2) return null;
  return (
    <div className="mt-6 flex gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">
      <ArrowDownWideNarrow className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-medium text-foreground">Why this order: </span>
        {parts.join("; ")}. Each step&apos;s saving is counted on top of the steps before it, so they add up to the plan instead of double counting.
      </p>
    </div>
  );
}
