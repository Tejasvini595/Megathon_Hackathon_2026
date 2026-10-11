"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearMeasure, markDeclined, markDone } from "./actions";

export type StepStatus = { kind: "done" } | { kind: "declined"; reason: string } | null;

export function StepActions({ homeId, id, status }: { homeId: string; id: string; status: StepStatus }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const btn = "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-hairline transition-colors hover:text-foreground active:scale-95 disabled:opacity-50";

  if (status) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-surface-2/60 px-3 py-2 text-xs">
        <span className={status.kind === "done" ? "text-volt" : "text-muted-foreground"}>{status.kind === "done" ? "You said this is already done" : `Not for you: ${status.reason}`}</span>
        <button className={btn} disabled={pending} onClick={() => start(() => clearMeasure(homeId, id))}>
          Undo
        </button>
      </div>
    );
  }

  if (asking) {
    return (
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await markDeclined(homeId, id, reason);
            setAsking(false);
            setReason("");
          });
        }}
      >
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Why? (optional)"
          aria-label="Reason you do not want this"
          className="min-w-0 flex-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs outline-none ring-1 ring-hairline focus:ring-volt/50"
        />
        <button type="submit" disabled={pending} className={cn(btn, "text-foreground")}>
          Rule out
        </button>
        <button type="button" onClick={() => setAsking(false)} className={btn} aria-label="Cancel">
          <X className="size-3" />
        </button>
      </form>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <button className={btn} disabled={pending} onClick={() => start(() => markDone(homeId, id))}>
        <Check className="size-3" /> Already done
      </button>
      <button className={btn} disabled={pending} onClick={() => setAsking(true)}>
        Not for me
      </button>
    </div>
  );
}
