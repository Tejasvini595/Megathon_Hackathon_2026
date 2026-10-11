"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { MessageSquare, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { cn } from "@/lib/utils";
import { deleteChat, type ChatSummary } from "./actions";

function when(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The home's saved chats, newest first: open one or delete it. */
export function ChatHistory({
  open,
  homeId,
  chats,
  current,
  onClose,
  onRemoved,
}: {
  open: boolean;
  homeId: string;
  chats: ChatSummary[] | null;
  current: string | null;
  onClose: () => void;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<ChatSummary | null>(null);
  const [pending, setPending] = useState(false);

  async function remove(c: ChatSummary) {
    setPending(true);
    try {
      await deleteChat(homeId, c.id);
      onRemoved(c.id);
    } catch {
      toast.error("Couldn't delete that chat. Try again.");
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/70">
            <motion.div
              role="dialog"
              aria-label="Your chats"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[75dvh] max-w-md flex-col rounded-t-3xl bg-surface-2 pb-safe ring-1 ring-hairline"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h2 className="text-base font-semibold">Your chats</h2>
                <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface">
                  <X className="size-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-3 pb-4">
                {chats === null ? (
                  <div className="space-y-2 p-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="shimmer h-11 rounded-2xl" />
                    ))}
                  </div>
                ) : chats.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">No saved chats yet. Ask something and it’ll appear here.</p>
                ) : (
                  <ul>
                    {chats.map((c) => (
                      <li key={c.id} className={cn("flex items-center gap-1 rounded-2xl", c.id === current && "bg-surface")}>
                        <button
                          onClick={() => {
                            onClose();
                            if (c.id !== current) router.push(`/ask/${homeId}/${c.id}`);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
                        >
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{when(c.updatedAt)}</span>
                        </button>
                        <button onClick={() => setConfirm(c)} aria-label={`Delete "${c.title}"`} className="mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={!!confirm}
        title="Delete this chat?"
        description={confirm ? `"${confirm.title}" and its answers will be gone for good. Anything you chose to remember stays in your plan.` : ""}
        confirmLabel="Delete"
        cancelLabel="Keep"
        pending={pending}
        onConfirm={() => confirm && remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
