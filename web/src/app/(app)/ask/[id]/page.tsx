import { Suspense } from "react";
import type { Metadata } from "next";
import { getOwnedHome } from "@/lib/homes";
import { AskView } from "../ask-view";

export const metadata: Metadata = { title: "Ask" };

export default function Page({ params }: PageProps<"/ask/[id]">) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-safe pb-44">
      <header className="pt-3">
        <p className="text-xs text-muted-foreground">Talking to</p>
        <h1 className="text-xl font-semibold tracking-tight">
          <Suspense fallback={<span className="shimmer inline-block h-5 w-32 rounded" />}>
            <HomeName params={params} />
          </Suspense>
        </h1>
      </header>
      <Suspense>
        <View params={params} />
      </Suspense>
    </div>
  );
}

async function HomeName({ params }: { params: PageProps<"/ask/[id]">["params"] }) {
  const { home } = await getOwnedHome((await params).id);
  return home.nickname;
}

/** The chat is keyed by home so switching homes starts a fresh conversation. */
async function View({ params }: { params: PageProps<"/ask/[id]">["params"] }) {
  const { home } = await getOwnedHome((await params).id);
  return <AskView key={home.id} homeId={home.id} />;
}
