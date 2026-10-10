"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TwinSceneProps } from "./scene";

// three.js needs the browser; render a quiet placeholder on the server and while the chunk loads.
const TwinScene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return (
    <div className="grid size-full place-items-center">
      <div className="size-40 rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)] animate-breathe" />
    </div>
  );
}

let webglSupport: boolean | null = null;
function detectWebGL() {
  if (webglSupport === null) {
    try {
      const c = document.createElement("canvas");
      webglSupport = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const noopSubscribe = () => () => {};

/** Friendly stand-in when the device can't (or stops being able to) run WebGL. */
export function WebGLFallback({ compact }: { compact?: boolean }) {
  return (
    <div className="grid size-full place-items-center px-8 text-center">
      <div className="max-w-xs">
        <svg viewBox="0 0 120 90" className={cn("mx-auto text-muted-foreground/60", compact ? "h-14" : "h-24")} fill="none" aria-hidden>
          <path d="M14 44 60 10l46 34" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M24 38v42h72V38" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <rect x="36" y="50" width="14" height="12" rx="1.5" stroke="var(--volt)" strokeWidth="2" />
          <rect x="70" y="50" width="14" height="12" rx="1.5" stroke="var(--volt)" strokeWidth="2" />
          <path d="M55 80V64h10v16" stroke="currentColor" strokeWidth="2" />
        </svg>
        {!compact && (
          <>
            <p className="mt-4 text-sm font-medium">3D view isn&apos;t available here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your browser couldn&apos;t start WebGL (it may be turned off, or hardware acceleration is disabled). Everything else works as normal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D view failed, showing fallback", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Pauses rendering while the canvas is scrolled away or the tab is hidden. */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return [ref, visible && tabVisible] as const;
}

export function TwinCanvas({ className, ...props }: TwinSceneProps & { className?: string }) {
  const supported = useSyncExternalStore(noopSubscribe, detectWebGL, () => true);
  const [lost, setLost] = useState(false);
  const [ref, active] = useOnScreen<HTMLDivElement>();
  const fallback = <WebGLFallback compact={props.interactive === false} />;

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      {!supported || lost ? (
        fallback
      ) : (
        <SceneBoundary fallback={fallback}>
          <TwinScene {...props} active={active} onContextLost={() => setLost(true)} />
        </SceneBoundary>
      )}
      {/* vignette in CSS: free, unlike a post-processing pass */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgba(0,0,0,0.55))]" />
    </div>
  );
}
