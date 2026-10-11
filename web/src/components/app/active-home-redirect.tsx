import { Suspense } from "react";
import { EmptyHome } from "@/components/app/empty-home";
import { PageSkeleton } from "@/components/app/page-skeleton";
import type { HomeSection } from "@/lib/active-home";
import { redirectToActiveHome } from "@/lib/homes";

/** Page for a bare section URL (/home, /plan, ...): sends the user to that section of the home they last opened. */
export function ActiveHomeRedirect({ section }: { section: HomeSection }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Resolve section={section} />
    </Suspense>
  );
}

async function Resolve({ section }: { section: HomeSection }) {
  const user = await redirectToActiveHome(section);
  return <EmptyHome name={user.name} />;
}
