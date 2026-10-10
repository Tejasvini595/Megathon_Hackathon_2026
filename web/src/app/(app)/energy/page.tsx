import { Suspense } from "react";
import type { Metadata } from "next";
import { Flame, Leaf, PoundSterling, Thermometer, Zap } from "lucide-react";
import { EmptyHome } from "@/components/app/empty-home";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { getActiveHome } from "@/lib/homes";

export const metadata: Metadata = { title: "Energy" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

const n = (x: number | null, d = 0) => (x == null ? "—" : x.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }));

async function Loader() {
  const { user, twin } = await getActiveHome();
  if (!twin) return <EmptyHome name={user.name} />;
  const e = twin.energy;
  const tiles = [
    { icon: Flame, label: "Gas", value: n(e.gasKwh), unit: "kWh a year" },
    { icon: Zap, label: "Electricity", value: n(e.elecKwh), unit: "kWh a year" },
    { icon: Thermometer, label: "Intensity", value: n(e.intensityKwhM2), unit: "kWh per m²" },
    { icon: Leaf, label: "Carbon", value: n(twin.carbonKg == null ? null : twin.carbonKg / 1000, 1), unit: "t CO₂e a year" },
  ];
  return (
    <div className="px-5 pt-safe pb-40">
      <h1 className="pt-3 text-2xl font-semibold tracking-tight">Energy</h1>
      <p className="text-xs text-muted-foreground">Annualised from {e.monthsMetered} months of meter readings</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {tiles.map(({ icon: Icon, label, value, unit }) => (
          <div key={label} className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
            <Icon className="size-4 text-muted-foreground" />
            <p className="tabular mt-4 text-3xl font-light tracking-tight">{value}</p>
            <p className="text-[11px] text-muted-foreground">
              {label} · {unit}
            </p>
          </div>
        ))}
      </div>
      {twin.value.currentGbp && (
        <div className="mt-3 rounded-3xl bg-surface p-4 ring-1 ring-hairline">
          <PoundSterling className="size-4 text-muted-foreground" />
          <p className="tabular mt-4 text-3xl font-light tracking-tight">£{n(twin.value.currentGbp)}</p>
          <p className="text-[11px] text-muted-foreground">Estimated value today · {twin.value.note}</p>
        </div>
      )}
      <div className="mt-3 rounded-3xl border border-dashed hairline p-5 text-sm text-muted-foreground">
        Monthly usage chart, carbon over time and &ldquo;homes like yours&rdquo; comparisons land here next.
      </div>
    </div>
  );
}
