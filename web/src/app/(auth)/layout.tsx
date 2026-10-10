import Link from "next/link";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-safe pb-safe">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(50%_50%_at_50%_50%,var(--volt-dim),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--background)_70%)]" />
      <header className="relative z-10 py-4">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
    </main>
  );
}
