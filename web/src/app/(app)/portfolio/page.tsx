import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ServerOff } from "lucide-react";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { requireUser } from "@/lib/dal";
import { engineJson } from "@/lib/engine";
import { PortfolioRow, type Row } from "./portfolio-row";

export const metadata: Metadata = { title: "Advisor view" };

type Portfolio = { councils: string[]; total: number; rows: Row[] };

export default function Page({ searchParams }: PageProps<"/portfolio">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}

async function Loader({ searchParams }: { searchParams: PageProps<"/portfolio">["searchParams"] }) {
  await requireUser();
  const sp = await searchParams;
  const council = typeof sp.council === "string" ? sp.council.slice(0, 80) : "";
  const data = await engineJson<Portfolio>(`/portfolio?limit=200${council ? `&council=${encodeURIComponent(council)}` : ""}`);
  const ok = data && Array.isArray(data.rows);

  return (
    <div className="px-5 pt-safe pb-40">
      <Link href="/you" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowLeft className="size-3.5" /> You
      </Link>
      <h1 className="pt-2 text-2xl font-semibold tracking-tight">Advisor view</h1>
      <p className="mt-1 text-xs text-muted-foreground">Poorly performing homes, ranked by how much they could improve.</p>
      <p className="mt-3 rounded-2xl bg-surface px-3.5 py-3 text-xs text-muted-foreground ring-1 ring-hairline">
        These are homes from the dataset, not your own. All figures are engine estimates, not guarantees or quotes.
      </p>

      {!ok ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl bg-surface p-8 text-center ring-1 ring-hairline">
          <ServerOff className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">The ranking isn&apos;t available right now</p>
          <p className="text-xs text-muted-foreground">The engine that scores the homes is not reachable. Try again in a moment.</p>
        </div>
      ) : (
        <>
          <form className="mt-4 flex items-center gap-2" action="/portfolio">
            <label htmlFor="council" className="sr-only">
              Council
            </label>
            <select id="council" name="council" defaultValue={council} className="min-w-0 flex-1 rounded-full bg-surface px-3.5 py-2 text-sm ring-1 ring-hairline">
              <option value="">All councils</option>
              {data.councils.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground active:scale-95">
              Filter
            </button>
          </form>
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            Showing {data.rows.length.toLocaleString("en-GB")} of {data.total.toLocaleString("en-GB")} homes{council ? ` in ${council}` : ""}.
          </p>
          <ol className="mt-3 space-y-3">
            {data.rows.map((r) => (
              <PortfolioRow key={r.property_id} r={r} />
            ))}
          </ol>
          {data.rows.length === 0 && <p className="mt-6 text-center text-sm text-muted-foreground">No homes match.</p>}
        </>
      )}
    </div>
  );
}
