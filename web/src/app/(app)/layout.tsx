import { BottomNav } from "./bottom-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md md:my-0 md:border-x md:hairline">
      {children}
      <BottomNav />
    </div>
  );
}
