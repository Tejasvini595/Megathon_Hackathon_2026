"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Link2Off, Share2 } from "lucide-react";
import { toast } from "sonner";
import { shareHome, unshareHome } from "./share-actions";

const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export function ShareButton({ homeId, sharedPath }: { homeId: string; sharedPath: string | null }) {
  const [path, setPath] = useState(sharedPath);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const url = path ? `${window.location.origin}${path}` : "";

  const create = () =>
    start(async () => {
      const next = await shareHome(homeId);
      if (next) setPath(next);
      else toast.error("Couldn't create a link");
    });

  const revoke = () =>
    start(async () => {
      await unshareHome(homeId);
      setPath(null);
      setOpen(false);
      toast("Link turned off");
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const nativeShare = () => navigator.share({ title: "My home's twin", url }).catch(() => {});

  return (
    <div ref={root} className="pointer-events-auto relative">
      <button
        type="button"
        aria-label="Share your twin"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="glass grid size-8 place-items-center rounded-full transition-transform active:scale-95"
      >
        <Share2 className="size-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl bg-card p-3 text-xs shadow-xl ring-1 ring-hairline">
          {path ? (
            <div className="space-y-1">
              <p className="px-1 pb-1 text-muted-foreground">Anyone with the link sees your 3D twin, nickname and score. No address.</p>
              <SheetButton onClick={copy}>
                {copied ? <Check className="size-4 text-volt" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}
              </SheetButton>
              {canNativeShare() && (
                <SheetButton onClick={nativeShare}>
                  <Share2 className="size-4" /> Share…
                </SheetButton>
              )}
              <SheetButton onClick={revoke} disabled={pending} className="text-destructive">
                <Link2Off className="size-4" /> Stop sharing
              </SheetButton>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="px-1 text-muted-foreground">Create a public link to a card showing your twin and score. Your address and postcode stay private.</p>
              <SheetButton onClick={create} disabled={pending} className="bg-volt/15 text-volt">
                <Share2 className="size-4" /> {pending ? "Creating…" : "Create link"}
              </SheetButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SheetButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-60 ${className ?? ""}`}
      {...props}
    />
  );
}
