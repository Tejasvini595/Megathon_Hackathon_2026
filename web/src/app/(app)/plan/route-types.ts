import type { RetrofitId } from "@/lib/twin/types";

export type RouteOption = {
  retrofits: RetrofitId[];
  labels: string[];
  cost_low: number;
  cost_high: number;
  cost_mid: number;
  score_after: number;
  class_after: string;
  rating_after: string;
  bill_saving_gbp: number;
  payback_years: number | null;
  carbon_kg: number;
  electricity_rises: boolean;
};

/** The parts of the engine's /plan answer this page shows. */
export type RoutePlan = {
  available: boolean;
  reason?: string | null;
  current: { score: number; class: string };
  target: { score: number; class: string } | null;
  reachable: boolean;
  options: RouteOption[];
  note?: string | null;
  memory_notes?: string[];
  excluded_by_memory?: Record<string, string>;
};
