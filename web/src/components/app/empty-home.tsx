import Link from "next/link";
import { ArrowRight, Camera, FileText, Mic } from "lucide-react";
import { TwinCanvas } from "@/components/twin/twin-canvas";
import { MOCK_TWIN } from "@/lib/twin/mock";
import { thermalGlow } from "@/lib/twin/types";

const GLOW = thermalGlow(MOCK_TWIN.elementScores);

export function EmptyHome({ name }: { name: string }) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-safe pb-36">
      <div className="pt-4">
        <p className="text-sm text-muted-foreground">Hi {name.split(" ")[0]}</p>
        <h1 className="text-gradient mt-1 text-4xl font-semibold leading-[1.05] tracking-tight">Let&apos;s build your home&apos;s twin.</h1>
      </div>
      <div className="relative -mx-5 my-4 h-[42dvh] min-h-[300px] opacity-80">
        <TwinCanvas geometry={MOCK_TWIN.geometry} heatLoss={GLOW} heatRef={1} mode="thermal" interactive={false} autoRotate className="absolute inset-0" />
      </div>
      <p className="text-muted-foreground">
        A photo, a few words, a floor plan or a voice note is enough. We&apos;ll work out the rest and you check it.
      </p>
      <div className="mt-5 flex gap-2 text-muted-foreground">
        {[Camera, FileText, Mic].map((Icon, i) => (
          <span key={i} className="grid size-10 place-items-center rounded-full bg-surface ring-1 ring-hairline">
            <Icon className="size-4" />
          </span>
        ))}
      </div>
      <Link
        href="/new"
        className="mt-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
      >
        Add my home <ArrowRight className="size-5" />
      </Link>
    </div>
  );
}
