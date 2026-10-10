"use client";

import { createContext, use, useState } from "react";
import { cn } from "@/lib/utils";
import type { Highlight, ViewMode } from "./house";

type TwinView = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  focus: Highlight;
  setFocus: (f: Highlight) => void;
  after: boolean;
  setAfter: (a: boolean) => void;
};

const TwinViewContext = createContext<TwinView | null>(null);

/**
 * Shared view state for a page's 3D stage and the server-rendered content around it,
 * so only the controls that change the view need to be client components.
 */
export function TwinViewProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ViewMode>("normal");
  const [focus, setFocus] = useState<Highlight>(null);
  const [after, setAfter] = useState(false);
  return <TwinViewContext value={{ mode, setMode, focus, setFocus, after, setAfter }}>{children}</TwinViewContext>;
}

export function useTwinView() {
  const ctx = use(TwinViewContext);
  if (!ctx) throw new Error("useTwinView must be used inside <TwinViewProvider>");
  return ctx;
}

/** Wraps server-rendered content; tapping it flies the camera to `element` in thermal view. */
export function FocusButton({ element, className, children }: { element: Exclude<Highlight, null>; className?: string; children: React.ReactNode }) {
  const { focus, setFocus, setMode } = useTwinView();
  const active = focus === element;
  return (
    <button
      type="button"
      data-active={active}
      aria-pressed={active}
      onClick={() => {
        setMode("thermal");
        setFocus(active ? null : element);
      }}
      className={cn("group w-full text-left", className)}
    >
      {children}
    </button>
  );
}
