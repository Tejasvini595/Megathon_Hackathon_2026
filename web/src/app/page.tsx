import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { LandingStage } from "./landing-stage";

export default function Page() {
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <LandingStage />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-safe">
        <div className="pt-3">
          <Logo />
        </div>
        <Link href="/sign-in" className="glass mt-3 rounded-full px-4 py-1.5 text-sm">
          Sign in
        </Link>
      </header>

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md px-6 pb-safe md:max-w-2xl">
        <p className="text-muted-foreground md:text-lg">
          Score your home, find what to fix first, and see the savings, carbon and value, calculated for your house rather than an average one.
        </p>
        <div className="mb-6 mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]">
            Get started <ArrowRight className="size-5" />
          </Link>
          <Link href="/sign-in" className="glass flex h-14 flex-1 items-center justify-center rounded-2xl text-base font-medium">
            I have an account
          </Link>
        </div>
      </div>
    </main>
  );
}
