import type { StreetBuilding } from "@/lib/geo/street";
import { BUILT_FORM, buildingType, roofLabel, runsAxis } from "./street-facts";

/** What the map knows about the selected building, so neighbours can be told apart. */
export function StreetInfo({ b }: { b: StreetBuilding }) {
  const form = b.suggestions.builtForm;
  const rows: [string, string][] = [["Type", buildingType(b)]];
  if (form) rows.push(["Form", BUILT_FORM[form.value]]);
  if (b.suggestions.storeys) rows.push(["Storeys", String(b.suggestions.storeys.value)]);
  const roof = roofLabel(b);
  if (roof) rows.push(["Roof", roof]);
  rows.push(["Footprint", `${b.measure.widthM} × ${b.measure.depthM} m · ${b.measure.areaM2} m²`]);
  rows.push(["Long side", `runs ${runsAxis(b.measure.bearingDeg)}`]);

  return (
    <div className="rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-hairline">
      {b.label && <p className="text-sm font-medium">{b.label}</p>}
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular">{v}</dd>
          </div>
        ))}
      </dl>
      {form && <p className="mt-1.5 text-[11px] text-muted-foreground">{form.evidence}</p>}
    </div>
  );
}
