"use client";

import { TriangleAlert } from "lucide-react";
import type { EnergyUsage } from "@/lib/extract/fields";
import { STEPS } from "./steps";
import { display, type FieldStates } from "./field-row";
import type { Missing } from "./missing";

function usageLine(usage: EnergyUsage | undefined) {
  if (usage?.annual) return "Yearly totals";
  if (usage?.months?.length) return `${usage.months.length} months`;
  return "Not added";
}

export function Summary({ fields, usage, missing, nickname, onNickname, onJump, models }: { fields: FieldStates; usage: EnergyUsage | undefined; missing: Missing[]; nickname: string; onNickname: (s: string) => void; onJump: (i: number) => void; models: string[] }) {
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">{missing.length ? "Almost there." : "Looking good."}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Give it a name and we&apos;ll build your twin. You can change any of this later.</p>
      {missing.length > 0 && (
        <ul aria-label="Still missing" className="mt-3 space-y-1.5">
          {missing.map((m) => (
            <li key={m.message}>
              <button onClick={() => onJump(STEPS.findIndex((s) => s.id === m.step))} className="flex w-full items-start gap-2.5 rounded-2xl bg-amber/10 px-3.5 py-2.5 text-left text-sm ring-1 ring-amber/25">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber" />
                {m.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-4 block rounded-2xl bg-surface px-4 py-3 ring-1 ring-hairline">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Name this home</span>
        <input value={nickname} onChange={(e) => onNickname(e.target.value)} maxLength={60} className="mt-0.5 w-full bg-transparent text-base outline-none" />
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => onJump(i)} className="rounded-2xl bg-surface px-3.5 py-3 text-left ring-1 ring-hairline active:scale-[0.98]">
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{s.label}</span>
            <span className="mt-1 line-clamp-2 block text-sm">
              {s.id === "usage" ? usageLine(usage) : s.fields.filter((k) => fields[k]).slice(0, 2).map((k) => display(k, fields[k]!.value)).join(" · ")}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Read by: {models.join(", ")}.</p>
    </>
  );
}
