"use client";

import { motion, useReducedMotion } from "motion/react";
import { EPC_BANDS, EPC_RANGES } from "@/lib/extract/epc";
import type { EpcBand } from "@/lib/twin/types";
import { cn } from "@/lib/utils";

/** The official EPC colours, A to G. */
export const EPC_COLOURS: Record<EpcBand, string> = { A: "#008054", B: "#19b459", C: "#8dce46", D: "#ffd500", E: "#fcaa65", F: "#ef8023", G: "#e9153b" };

const SIZES = { sm: { row: 20, gap: 3, text: "text-[11px]" }, md: { row: 28, gap: 4, text: "text-sm" }, lg: { row: 38, gap: 5, text: "text-base" } } as const;
const GUTTER = 44;

type Props = {
  /** The recorded or computed band; null when there is none yet. */
  band: EpcBand | null;
  /** The estimated bracket, drawn as shimmering bars with a "≈". */
  range?: [EpcBand, EpcBand];
  /** An arrow runs from `band` to this band (e.g. after a retrofit plan). */
  after?: EpcBand;
  /** Picker mode: the bars become buttons. */
  onSelect?: (b: EpcBand) => void;
  size?: keyof typeof SIZES;
};

const scoreText = (b: EpcBand) => (b === "A" ? "92+" : `${EPC_RANGES[b][0]}–${EPC_RANGES[b][1]}`);

/** The EPC certificate ladder: bars widen from A (best) to G, in the official colours. */
export function EpcLadder({ band, range, after, onSelect, size = "md" }: Props) {
  const reduce = useReducedMotion();
  const { row, gap, text } = SIZES[size];
  const idx = (b: EpcBand) => EPC_BANDS.indexOf(b);
  const inRange = (b: EpcBand) => range != null && idx(b) >= Math.min(idx(range[0]), idx(range[1])) && idx(b) <= Math.max(idx(range[0]), idx(range[1]));
  const lit = (b: EpcBand) => b === band || b === after || inRange(b);
  const dim = band != null || range != null || after != null;
  const centre = (b: EpcBand) => idx(b) * (row + gap) + row / 2;
  const height = EPC_BANDS.length * row + (EPC_BANDS.length - 1) * gap;
  const label = band ? `EPC band ${band}${after ? `, ${after} after the plan` : ""}` : range ? `EPC band about ${range[0]} to ${range[1]}` : "EPC band not known";

  return (
    <div role={onSelect ? "radiogroup" : "img"} aria-label={onSelect ? "EPC band" : label} className="relative" style={{ height, paddingRight: GUTTER }}>
      {EPC_BANDS.map((b, i) => {
        const width = `${42 + (i / (EPC_BANDS.length - 1)) * 58}%`;
        const estimated = inRange(b) && b !== band;
        const style = { top: i * (row + gap), height: row, width, backgroundColor: EPC_COLOURS[b], color: b === "D" || b === "C" || b === "E" ? "#1a1a1a" : "#fff" };
        const inner = (
          <>
            <span className={cn("font-semibold", text)}>{b}</span>
            {size !== "sm" && <span className="text-[11px] opacity-80">{scoreText(b)}</span>}
          </>
        );
        const common = {
          style,
          initial: false,
          animate: { opacity: dim && !lit(b) ? 0.3 : estimated && !reduce ? [0.6, 1, 0.6] : 1, scaleY: b === band ? 1.1 : 1 },
          transition: estimated && !reduce ? { duration: 1.6, repeat: Infinity } : { type: "spring" as const, stiffness: 400, damping: 30 },
          className: "absolute left-0 flex origin-left items-center justify-between rounded-r-md px-2.5 text-left",
        };
        return onSelect ? (
          <motion.button key={b} role="radio" aria-checked={b === band} aria-label={`Band ${b}, ${scoreText(b)}`} onClick={() => onSelect(b)} {...common} whileTap={{ scale: 0.98 }}>
            {inner}
          </motion.button>
        ) : (
          <motion.div key={b} {...common}>
            {inner}
          </motion.div>
        );
      })}
      {band && after && band !== after && (
        <svg className="pointer-events-none absolute right-0 top-0" width={GUTTER} height={height} aria-hidden>
          <motion.path
            d={`M 4 ${centre(band)} C ${GUTTER - 8} ${centre(band)}, ${GUTTER - 8} ${centre(after)}, 8 ${centre(after)}`}
            fill="none"
            stroke="var(--volt)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
          <path d={`M 14 ${centre(after) - 5} L 6 ${centre(after)} L 14 ${centre(after) + 5}`} fill="none" stroke="var(--volt)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {range && (
        <motion.span
          className="absolute right-0 text-xs font-semibold text-foreground"
          style={{ top: Math.min(centre(range[0]), centre(range[1])) + (Math.abs(centre(range[0]) - centre(range[1])) - 16) / 2 }}
          animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          ≈ {range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}
        </motion.span>
      )}
      {band && !after && !range && (
        <span className="absolute right-0 text-xs text-muted-foreground" style={{ top: centre(band) - 8 }}>
          ◀
        </span>
      )}
    </div>
  );
}
