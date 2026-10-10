import { Suspense } from "react";
import type { Metadata } from "next";
import { HomeView } from "@/components/app/home-view";
import { EmptyHome } from "@/components/app/empty-home";
import { getActiveHome } from "@/lib/homes";
import { PageSkeleton } from "@/components/app/page-skeleton";

export const metadata: Metadata = { title: "Home" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeLoader />
    </Suspense>
  );
}

async function HomeLoader() {
  const { user, twin } = await getActiveHome();
  if (!twin) return <EmptyHome name={user.name} />;
  const { source, ...state } = twin;
  return <HomeView twin={state} source={source} />;
}
