export type MTable = { title: string; headers: string[]; rows: string[][]; note?: string };
export type Component = { key: string; label: string; weight: number; summary: string; tables: MTable[] };
export type Row = {
  label: string;
  unit: string;
  tier: string;
  betterWhen: "lower" | "higher";
  values: Record<string, number | null>;
  baseline: Record<string, number | null> | null;
  target: number | null;
};
export type Methods = {
  score: { formula: string; weights: { key: string; label: string; weight: number }[]; classes: { min: number; label: string }[]; components: Component[] };
  carbon: {
    formula: string;
    unit: string;
    factors: { fuel: string; value: number }[];
    source: string;
    tariffs: { unit: string; electricity: number; gas: number; note: string };
  };
  retrofits: { id: string; label: string; name: string; applicability: string; impact: string; impactSource: string; costLowGbp: number; costHighGbp: number; costSource: string; order: number }[];
  payback: { highYears: number; mediumYears: number; rule: string };
  value: { formula: string; range: string; note: string; unavailable: string; ratingPremium: { pctPer10Sap: number | null; nSales: number | null } };
  finance: { loans: { id: string; label: string; aprPct: number; terms: number[] }[]; epcCSap: number; borderlineSap: number; heatPumpGrantGbp: number; sources: string[] };
  evidence: {
    splits: Record<string, string>;
    tiers: { id: string; name: string; text: string }[];
    rows: Row[];
    nHomes: Record<string, number> | null;
    note: string | null;
  };
  limitations: string[];
};
