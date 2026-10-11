"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldKey } from "@/lib/extract/fields";
import type { FieldImpact, QuestionPlan } from "@/lib/questions";
import { planQuestions } from "./question-actions";

const DEBOUNCE_MS = 600;

/**
 * The engine's question ranking for the record as it stands. The review never waits for it: the plan is null until the
 * first answer arrives, calls are debounced after each change, and an answer that is no longer the latest is dropped.
 * A question the user has just answered keeps its last known place so rows don't jump under their finger.
 */
export function useQuestionPlan(record: Record<string, unknown>, alternatives: Partial<Record<FieldKey, Record<string, number>>>, postcode: string | null) {
  const [plan, setPlan] = useState<QuestionPlan | null>(null);
  const latest = useRef(0);
  const known = useRef(new Map<FieldKey, FieldImpact>());
  const payload = JSON.stringify([record, alternatives, postcode]);

  useEffect(() => {
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      let next: QuestionPlan;
      try {
        const [r, a, p] = JSON.parse(payload) as [Record<string, unknown>, typeof alternatives, string | null];
        next = await planQuestions(r, a, p);
      } catch {
        return;
      }
      if (id !== latest.current) return;
      if (next.source === "engine") {
        const kept = [...known.current.values()].filter((o) => !next.fields.some((f) => f.key === o.key));
        for (const f of next.fields) known.current.set(f.key, f);
        next = { ...next, fields: [...next.fields, ...kept] };
      }
      setPlan(next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [payload]);

  return plan;
}
