import { Suspense } from "react";
import type { Metadata } from "next";
import { getActiveHomeRow } from "@/lib/homes";
import { AskView } from "./ask-view";

export const metadata: Metadata = { title: "Ask" };

export default function Page() {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-safe pb-44">
      <header className="pt-3">
        <p className="text-xs text-muted-foreground">Talking to</p>
        <h1 className="text-xl font-semibold tracking-tight">
          <Suspense fallback={<span className="shimmer inline-block h-5 w-32 rounded" />}>
            <HomeName />
          </Suspense>
        </h1>
      </header>
      <AskView />
    </div>
  );
}

async function HomeName() {
  const { home } = await getActiveHomeRow();
  return home?.nickname ?? "your home";
}
