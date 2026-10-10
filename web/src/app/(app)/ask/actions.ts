"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";

export type AskReply = { text: string; trace: string[] };

/**
 * What-if entry point. Planned pipeline: decision model parses the question into a typed scenario
 * -> feasibility rules -> engine reruns -> LLM explains the computed diff -> grounding check.
 * Until that lands it returns a placeholder that never invents numbers.
 */
export async function askHome(question: string): Promise<AskReply> {
  await requireUser();
  const q = z.string().trim().min(1).max(500).parse(question);
  void q;
  return {
    text: "I'll answer this once the engine is connected. I only explain numbers the engine has calculated for your home, never my own estimates.",
    trace: ["parse → scenario", "feasibility rules", "engine rerun", "explain", "grounding check"],
  };
}
