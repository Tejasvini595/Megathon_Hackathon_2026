import { epcTone, formatGbp, formatNumber, formatSaving, scoreTone } from "@/lib/score";

export type Row = {
  rank: number;
  property_id: string;
  postcode: string;
  local_authority: string;
  score: number;
  classification: string;
  energy_rating: string;
  intensity_kwh_m2: number | null;
  floor_area: number | null;
  improvement_potential_pct: number | null;
  improvement_potential_no_hp_pct: number | null;
  elec_saving_kwh: number | null;
  gas_saving_kwh: number | null;
  carbon_saving_t: number | null;
  package_cost_gbp: number | null;
  measures: string | null;
  unavailable_reason: string | null;
  key_issues: string | null;
};

const pct = (n: number | null) => (n == null ? "—" : `${formatNumber(n, 0)}%`);
const words = (s: string) => s.replaceAll("_", " ");

export function PortfolioRow({ r }: { r: Row }) {
  const measures = r.measures ? r.measures.split("+") : [];
  const issues = r.key_issues ? r.key_issues.split("; ").filter(Boolean) : [];
  return (
    <li className="rounded-3xl bg-surface p-4 ring-1 ring-hairline">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">#{r.rank}</p>
          <p className="font-medium">{r.postcode}</p>
          <p className="truncate text-xs text-muted-foreground">{r.local_authority}</p>
        </div>
        <div className="text-right">
          <p className="tabular text-2xl font-light" style={{ color: scoreTone(r.score) }}>
            {formatNumber(r.score, 0)}
          </p>
          <p className="text-[11px] text-muted-foreground">{r.classification}</p>
          <p className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-black" style={{ background: epcTone(r.energy_rating) }}>
            EPC {r.energy_rating}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t hairline pt-3 text-xs">
        <Stat label="Energy use" value={r.intensity_kwh_m2 == null ? "—" : `${formatNumber(r.intensity_kwh_m2, 0)} kWh/m²`} />
        <Stat label="Could improve" value={`${pct(r.improvement_potential_pct)} (${pct(r.improvement_potential_no_hp_pct)} without heat pump)`} />
        <Stat label="Gas use (change)" value={r.gas_saving_kwh == null ? "—" : `${formatSaving(r.gas_saving_kwh)} kWh/yr`} />
        <Stat label="Electricity use (change)" value={r.elec_saving_kwh == null ? "—" : `${formatSaving(r.elec_saving_kwh)} kWh/yr`} />
        <Stat label="Carbon" value={r.carbon_saving_t == null ? "—" : `${formatNumber(r.carbon_saving_t, 1)} t CO₂e/yr`} />
        <Stat label="Package cost" value={r.package_cost_gbp == null ? "—" : formatGbp(r.package_cost_gbp)} />
      </dl>

      {r.unavailable_reason ? (
        <p className="mt-3 rounded-2xl bg-amber/10 px-3 py-2 text-xs text-amber">Unavailable: {r.unavailable_reason}</p>
      ) : (
        measures.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {measures.map((m) => (
              <li key={m} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] capitalize">
                {words(m)}
              </li>
            ))}
          </ul>
        )
      )}
      {issues.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Key issues: {issues.join("; ")}</p>}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
