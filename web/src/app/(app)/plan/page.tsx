import { Suspense } from "react";
import type { Metadata } from "next";
import { PlanView } from "@/components/app/plan-view";
import { EmptyHome } from "@/components/app/empty-home";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { getActiveHome } from "@/lib/homes";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const { user, twin } = await getActiveHome();
  if (!twin) return <EmptyHome name={user.name} />;
  return <PlanView twin={twin} />;
}
