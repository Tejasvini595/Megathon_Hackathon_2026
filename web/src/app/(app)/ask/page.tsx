import { Suspense } from "react";
import type { Metadata } from "next";
import { AskView } from "@/components/app/ask-view";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { getActiveHome } from "@/lib/homes";

export const metadata: Metadata = { title: "Ask" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const { home } = await getActiveHome();
  return <AskView nickname={home?.nickname ?? "your home"} />;
}
