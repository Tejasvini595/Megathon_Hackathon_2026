"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTwinView } from "@/components/twin/twin-view";
import { cn } from "@/lib/utils";

export type HomeOption = {
  id: string;
  nickname: string;
  postcode: string | null;
  status: "DRAFT" | "CONFIRMED";
};

interface HomeSwitcherProps {
  homes: HomeOption[];
  currentHomeId: string;
  nickname: string;
  postcode: string | null;
}

export function HomeSwitcher({
  homes,
  currentHomeId,
  nickname,
  postcode,
}: HomeSwitcherProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { setIsSwitching } = useTwinView();

  // Reset switching state and keep cookie synced when current home changes
  useEffect(() => {
    setIsSwitching(false);
    if (currentHomeId) {
      document.cookie = `last_home_id=${currentHomeId}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [currentHomeId, setIsSwitching]);

  function handleSelect(homeId: string) {
    if (homeId === currentHomeId) return;
    setIsSwitching(true);
    startTransition(() => {
      router.push(`/home?homeId=${homeId}`);
    });
  }

  const subtitle = postcode || "No postcode";

  return (
    <div className="flex flex-col items-start">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group relative flex cursor-pointer items-center gap-2.5 rounded-full px-4 py-2",
              "border border-white/20 bg-card/75 dark:bg-card/50 backdrop-blur-xl",
              "shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.25)]",
              "transition-all duration-200 hover:bg-card/90 dark:hover:bg-card/70 hover:border-white/35",
              "hover:shadow-[0_10px_28px_rgba(0,0,0,0.4),inset_0_1px_1.5px_rgba(255,255,255,0.35)]",
              "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt/60",
              "select-none"
            )}
            aria-label="Switch home"
          >
            <span className="size-2 rounded-full bg-volt shadow-[0_0_8px_var(--volt)] shrink-0" />
            <span className="text-base font-semibold tracking-tight text-foreground truncate max-w-[200px]">
              {nickname}
            </span>
            <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-hover:text-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="min-w-[260px] max-w-[320px] rounded-2xl p-1.5 glass border-hairline shadow-2xl"
        >
          <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Your homes
          </DropdownMenuLabel>

          <div className="max-h-72 overflow-y-auto space-y-0.5 [scrollbar-width:none]">
            {homes.map((h) => {
              const isCurrent = h.id === currentHomeId;
              return (
                <DropdownMenuItem
                  key={h.id}
                  onClick={() => handleSelect(h.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 cursor-pointer transition-colors",
                    isCurrent ? "bg-surface-2 text-foreground font-medium" : "text-foreground/90 hover:bg-surface-2"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{h.nickname}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-volt/15 px-1.5 py-0.5 text-[10px] font-semibold text-volt">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.status === "CONFIRMED" ? "Twin ready" : "Draft"}
                      {h.postcode ? ` · ${h.postcode}` : ""}
                    </p>
                  </div>
                  {isCurrent && <Check className="size-4 text-volt shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link
              href="/new"
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-volt transition-colors hover:bg-volt/10 cursor-pointer"
            >
              <Plus className="size-4 shrink-0" />
              <span>Add a home</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <p className="mt-1 px-1 text-xs text-muted-foreground font-medium">{subtitle}</p>
    </div>
  );
}
