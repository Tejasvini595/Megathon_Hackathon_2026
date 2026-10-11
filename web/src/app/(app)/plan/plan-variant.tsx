"use client";

import { createContext, use, useState } from "react";

export type Variant = "full" | "noHeatPump";
type Ctx = { variant: Variant; setVariant: (v: Variant) => void };

const PlanVariantContext = createContext<Ctx | null>(null);

/** Which of the two packages the summary and the 3D stage are showing. */
export function PlanVariantProvider({ children }: { children: React.ReactNode }) {
  const [variant, setVariant] = useState<Variant>("full");
  return <PlanVariantContext value={{ variant, setVariant }}>{children}</PlanVariantContext>;
}

export function usePlanVariant() {
  const ctx = use(PlanVariantContext);
  if (!ctx) throw new Error("usePlanVariant must be used inside <PlanVariantProvider>");
  return ctx;
}
