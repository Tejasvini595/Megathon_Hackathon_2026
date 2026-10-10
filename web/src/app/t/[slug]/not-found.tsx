import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/app/logo";

export const metadata: Metadata = { title: "Twin card not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="stage-glow grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-xs">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">This twin card isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted-foreground">The link may have been turned off by its owner, or it was mistyped.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-volt px-5 py-2.5 text-sm font-medium text-black">
          Build your own twin
        </Link>
      </div>
    </main>
  );
}
