import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { CaseCard } from "./case-card";
import { CASES } from "./data";
import { runCase } from "./run";

export const metadata: Metadata = { title: "Edge cases" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const runs = await Promise.all(CASES.map(runCase));
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-safe pb-24">
      <Link href="/you" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowLeft className="size-3.5" /> You
      </Link>
      <h1 className="pt-2 text-2xl font-semibold tracking-tight">Edge cases</h1>
      <p className="mt-1 text-xs text-muted-foreground">Live engine runs on homes built to break things</p>
      <p className="mt-3 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">
        Each card runs the engine now on a made-up home. Every figure is the engine&apos;s; nothing here is calculated in the app.
      </p>
      <ol className="mt-4 space-y-4">
        {CASES.map((c, i) => (
          <CaseCard key={c.id} n={i + 1} c={c} run={runs[i]} />
        ))}
      </ol>
    </div>
  );
}
