"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EpcBand } from "@/lib/twin/types";

const BANDS: EpcBand[] = ["A", "B", "C", "D", "E", "F", "G"];
const COLOUR: Record<EpcBand, string> = { A: "#008054", B: "#19b459", C: "#8dce46", D: "#ffd500", E: "#fcaa65", F: "#ef8023", G: "#e9153b" };

type Props = {
  band: EpcBand | null;
  /** Estimated bracket, drawn shimmering. */
  range?: [EpcBand, EpcBand];
  /** Band after the plan, marked with an arrow. */
  after?: EpcBand;
  /** Picker mode: bands become buttons. */
  onSelect?: (b: EpcBand) => void;
  size?: "sm" | "md";
};

/** Minimal stand-in; replaced by the shared ladder at merge. */
export function EpcLadder({ band, range, after, onSelect, size = "md" }: Props) {
  const inRange = (b: EpcBand) => range && BANDS.indexOf(b) >= BANDS.indexOf(range[0]) && BANDS.indexOf(b) <= BANDS.indexOf(range[1]);
  return (
    <div className="space-y-1">
      {BANDS.map((b, i) => {
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={b}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(b) } : {})}
            className={cn("flex items-center gap-2 text-left", size === "sm" ? "h-4" : "h-5")}
          >
            <span
              className={cn("flex h-full items-center rounded-r-md px-1.5 text-[10px] font-bold text-black", inRange(b) && "shimmer", band && b !== band && !inRange(b) && "opacity-35")}
              style={{ width: `${34 + i * 10}%`, background: COLOUR[b] }}
            >
              {b}
            </span>
            {b === band && <span className="text-[10px] text-muted-foreground">now</span>}
            {b === after && (
              <span className="flex items-center gap-0.5 text-[10px] text-volt">
                <ArrowRight className="size-3" /> after plan
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
