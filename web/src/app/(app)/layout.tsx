import { Suspense } from "react";
import { BottomNav, NavBar } from "./bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md md:my-0 md:border-x md:hairline">
      {children}
      <Suspense fallback={<NavBar />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
