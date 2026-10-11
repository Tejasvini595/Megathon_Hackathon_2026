import Link from "next/link";
import { PoundSterling } from "lucide-react";
import { formatGbp } from "@/lib/score";
import type { TwinState } from "@/lib/twin/types";

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/** Indicative value uplift from the engine: the % range always, pounds only when the home's value is known. */
export function ValueCard({ value, editHref }: { value: TwinState["value"]; editHref: string }) {
  const { upliftPct, valueAfterGbp, currentGbp } = value;
  return (
    <div className="flex items-start gap-3">
      <PoundSterling className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {upliftPct ? (
          <>
            <p className="text-sm">
              Indicative value uplift{" "}
              <span className="tabular font-medium">
                +{pct(upliftPct[0])} to +{pct(upliftPct[1])}
              </span>
              {valueAfterGbp && (
                <>
                  {" "}
                  <span className="tabular text-muted-foreground">
                    ({currentGbp ? `${formatGbp(currentGbp)} → ` : ""}about {formatGbp(valueAfterGbp[0])} to {formatGbp(valueAfterGbp[1])})
                  </span>
                </>
              )}
            </p>
            {!valueAfterGbp && (
              <Link href={editHref} className="mt-0.5 block text-xs text-volt underline-offset-2 hover:underline">
                Add your home&apos;s value to see this in pounds
              </Link>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">{value.note}</p>
          </>
        ) : (
          <>
            <p className="text-sm">Value uplift can&apos;t be estimated for this home</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{value.note}</p>
          </>
        )}
      </div>
    </div>
  );
}
