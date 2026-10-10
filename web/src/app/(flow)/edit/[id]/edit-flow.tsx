"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { geometryFromRecord } from "@/lib/twin/from-record";
import { MOCK_TWIN } from "@/lib/twin/mock";
import type { ExtractionResult } from "@/lib/extract/fields";
import type { StageView } from "../../new/capture-flow";
import { ReviewStep } from "../../new/review-step";
import { partsUpTo } from "../../new/steps";

export function EditFlow({ homeId, nickname, extraction, backHref }: { homeId: string; nickname: string; extraction: ExtractionResult; backHref: string }) {
  const [{ markers, ...view }, setView] = useState<StageView>({ geometry: geometryFromRecord({}), parts: partsUpTo(0), interactive: false });

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden">
      <header className="absolute inset-x-0 z-20 mx-auto flex max-w-md items-center justify-between px-5 pt-safe">
        <Link href={backHref} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-hairline">
          <X className="size-4" />
        </Link>
      </header>
      <div className="relative h-[46dvh] shrink-0">
        <TwinCanvas className="absolute inset-0" heatLoss={MOCK_TWIN.heatLoss} mode="normal" {...view}>
          {markers}
        </TwinCanvas>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[linear-gradient(transparent,var(--background))]" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ReviewStep homeId={homeId} extraction={extraction} initialNickname={nickname} onView={setView} />
      </div>
    </div>
  );
}
