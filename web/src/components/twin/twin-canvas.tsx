"use client";

import dynamic from "next/dynamic";
import type { TwinSceneProps } from "./scene";

// three.js needs the browser; render a quiet placeholder on the server and while the chunk loads.
const TwinScene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <div className="size-40 rounded-full bg-volt/10 blur-2xl animate-breathe" />
    </div>
  ),
});

export function TwinCanvas(props: TwinSceneProps) {
  return <TwinScene {...props} />;
}
