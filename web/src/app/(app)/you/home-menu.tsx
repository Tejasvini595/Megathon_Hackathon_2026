"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, PenLine, Play, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteHome, renameHome } from "./home-actions";

type Dialog = "rename" | "delete" | null;

export function HomeMenu({ id, nickname, draft, editHref }: { id: string; nickname: string; draft: boolean; editHref: string | null }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState(nickname);
  const [pending, start] = useTransition();
  const close = () => setDialog(null);

  function rename() {
    start(async () => {
      const err = await renameHome(id, name);
      if (err) toast.error(err.error);
      else close();
    });
  }

  function remove() {
    start(async () => {
      await deleteHome(id);
      close();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Manage ${nickname}`} className="mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-foreground">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          {editHref && (
            <DropdownMenuItem asChild>
              <Link href={editHref}>
                {draft ? <Play className="size-4" /> : <PenLine className="size-4" />} {draft ? "Continue" : "Edit details"}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setName(nickname);
              setDialog("rename");
            }}
          >
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 className="size-4" /> {draft ? "Delete draft" : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "rename" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 animate-in fade-in duration-150" onClick={close}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
            className="w-full max-w-sm rounded-3xl bg-surface-2 p-5 ring-1 ring-hairline animate-in zoom-in-95 duration-150"
          >
            <h2 className="text-base font-semibold">Rename home</h2>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Home name" className="mt-3 w-full rounded-2xl bg-surface px-3.5 py-2.5 text-base outline-none ring-1 ring-hairline focus:ring-volt/50" />
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={close} className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium ring-1 ring-hairline">
                Cancel
              </button>
              <button type="submit" disabled={pending || !name.trim()} className="flex-1 rounded-full bg-volt py-2.5 text-sm font-semibold text-black disabled:opacity-50">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={dialog === "delete"}
        title={draft ? "Delete this draft?" : `Delete ${nickname}?`}
        description={draft ? "What you've added so far will be deleted." : "Its twin, plan and chat will be deleted for good."}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        pending={pending}
        onConfirm={remove}
        onCancel={close}
      />
    </>
  );
}
