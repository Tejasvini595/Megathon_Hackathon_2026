import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium tracking-tight", className)}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
        <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 16.5c2.2-4.5 7.8-4.5 10 0" stroke="var(--volt)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.4" fill="var(--volt)" />
      </svg>
      <span>
        Green Home <span className="text-muted-foreground">Twin</span>
      </span>
    </span>
  );
}
