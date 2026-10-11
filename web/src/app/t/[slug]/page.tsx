import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { optionLabel, type PropertyRecord } from "@/lib/extract/fields";
import { scoreTone } from "@/lib/score";
import { thermalGlow } from "@/lib/twin/types";
import { getSharedTwin } from "./data";
import { HoloCard } from "./holo-card";

/** Per-request lookup with no static shell: the card is meaningless before the slug is resolved. */
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/t/[slug]">): Promise<Metadata> {
  const shared = await getSharedTwin((await params).slug);
  if (!shared) return { title: "Twin card not found", robots: { index: false } };
  const { score, scoreClass } = shared.twin;
  return {
    title: `Green Home Score ${score}`,
    description: `A home's digital twin rated ${scoreClass} (${score}/100). Build your own Green Home Twin.`,
    robots: { index: false },
  };
}

export default async function Page({ params }: PageProps<"/t/[slug]">) {
  const shared = await getSharedTwin((await params).slug);
  if (!shared) notFound();
  const { twin, record } = shared;
  const r = (record ?? {}) as Partial<PropertyRecord>;
  const chips = [
    r.builtForm && optionLabel("builtForm", r.builtForm),
    r.heating && optionLabel("heating", r.heating),
    r.ageBand && `Built ${optionLabel("ageBand", r.ageBand)}`,
    twin.geometry.hasSolar && "Solar panels",
  ].filter(Boolean) as string[];

  return (
    <main className="stage-glow flex min-h-dvh flex-col items-center justify-center gap-5 px-5 py-8">
      <HoloCard geometry={twin.geometry} heatLoss={thermalGlow(twin.elementScores)}>
        <div className="px-5 pb-5 pt-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Green Home Twin</p>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{twin.nickname}</h1>
          <div className="mt-3 flex items-end gap-3">
            <span className="tabular text-6xl font-light leading-none tracking-tighter" style={{ color: scoreTone(twin.score) }}>
              {twin.score}
            </span>
            <span className="pb-1 text-sm">
              <span className="block font-medium">{twin.scoreClass}</span>
              <span className="text-xs text-muted-foreground">Green Home Score</span>
            </span>
          </div>
          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <li key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-hairline">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      </HoloCard>
      <Link href="/" className="flex items-center gap-2 rounded-full bg-volt px-6 py-3 text-sm font-medium text-black transition-transform active:scale-95">
        Build your own twin <ArrowRight className="size-4" />
      </Link>
    </main>
  );
}
