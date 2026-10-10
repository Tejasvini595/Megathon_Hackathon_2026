"use client";

import dynamic from "next/dynamic";
import { Component, useState, useSyncExternalStore, type ReactNode } from "react";
import { WebGLFallback } from "@/components/twin/twin-canvas";
import type { HoloSceneProps } from "./holo-scene";

const HoloScene = dynamic(() => import("./holo-scene"), {
  ssr: false,
  loading: () => <div className="size-full animate-breathe rounded-full bg-[radial-gradient(circle,var(--volt-dim),transparent_70%)]" />,
});

let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noopSubscribe = () => () => {};

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const tabVisible = () => document.visibilityState === "visible";

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D card failed, showing fallback", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function HoloCanvas(props: Omit<HoloSceneProps, "active" | "onContextLost">) {
  const supported = useSyncExternalStore(noopSubscribe, hasWebGL, () => true);
  const active = useSyncExternalStore(subscribeVisibility, tabVisible, () => true);
  const [lost, setLost] = useState(false);
  const fallback = <WebGLFallback />;
  if (!supported || lost) return fallback;
  return (
    <SceneBoundary fallback={fallback}>
      <HoloScene {...props} active={active} onContextLost={() => setLost(true)} />
    </SceneBoundary>
  );
}
