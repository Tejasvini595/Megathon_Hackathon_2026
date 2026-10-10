"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Gauge, House, Mic, Route, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/home", label: "Home", icon: House },
  { href: "/plan", label: "Plan", icon: Route },
  { href: "/ask", label: "Ask", icon: Mic, orb: true },
  { href: "/energy", label: "Energy", icon: Gauge },
  { href: "/you", label: "You", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-safe">
      <div className="glass pointer-events-auto relative flex w-full max-w-md items-center justify-between rounded-[28px] px-2 py-1.5 shadow-2xl shadow-black/50">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          if ("orb" in item) {
            return (
              <Link key={item.href} href={item.href} aria-label="Ask your home" className="relative -mt-7 grid place-items-center">
                <span className="absolute size-20 animate-breathe rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--volt)_40%,transparent),transparent_70%)]" />
                <span className="relative grid size-14 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#d8fff0,var(--volt)_45%,#0e6b4f)] text-black shadow-[0_8px_30px_-6px_var(--volt)] ring-4 ring-background transition-transform active:scale-95">
                  <Icon className="size-6" strokeWidth={2.2} />
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-medium tracking-wide transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {active && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-surface-2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
              )}
              <Icon className="relative size-5" strokeWidth={active ? 2.2 : 1.8} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
