"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import type { ViewMode } from "@/components/twin/house";
import { Logo } from "@/components/app/logo";
import { MOCK_TWIN } from "@/lib/twin/mock";

const LINES: Record<ViewMode, { eyebrow: string; title: string }> = {
  normal: { eyebrow: "Your home", title: "A living model of your home." },
  thermal: { eyebrow: "Thermal vision", title: "See exactly where the heat goes." },
};

export function LandingHero() {
  const [mode, setMode] = useState<ViewMode>("normal");
  useEffect(() => {
    const t = setInterval(() => setMode((m) => (m === "normal" ? "thermal" : "normal")), 4500);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <TwinCanvas geometry={{ ...MOCK_TWIN.geometry, hasSolar: mode === "normal" }} heatLoss={MOCK_TWIN.heatLoss} mode={mode} interactive={false} className="!absolute inset-x-0 top-0 !h-[66%]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,transparent_22%,transparent_50%,var(--background)_88%)]" />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between px-6 pt-safe">
        <div className="pt-3">
          <Logo />
        </div>
        <Link href="/sign-in" className="mt-3 rounded-full glass px-4 py-1.5 text-sm">
          Sign in
        </Link>
      </header>

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md px-6 pb-safe md:max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: mode === "thermal" ? "var(--ember)" : "var(--volt)" }}>
              {LINES[mode].eyebrow}
            </p>
            <h1 className="text-gradient mt-2 text-[2.75rem] font-semibold leading-[1.02] tracking-tight md:text-6xl">{LINES[mode].title}</h1>
          </motion.div>
        </AnimatePresence>
        <p className="mt-4 text-muted-foreground md:text-lg">
          Score your home, find what to fix first, and see the savings, carbon and value, calculated for your house rather than an average one.
        </p>
        <div className="mb-6 mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]">
            Get started <ArrowRight className="size-5" />
          </Link>
          <Link href="/sign-in" className="flex h-14 flex-1 items-center justify-center rounded-2xl glass text-base font-medium">
            I have an account
          </Link>
        </div>
      </div>
    </main>
  );
}
