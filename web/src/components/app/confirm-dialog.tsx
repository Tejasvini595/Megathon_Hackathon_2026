"use client";

/** Small in-app confirmation. Opaque on purpose: no backdrop blur over the 3D canvas. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 animate-in fade-in duration-150" onClick={pending ? undefined : onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-surface-2 p-5 ring-1 ring-hairline animate-in zoom-in-95 duration-150"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" autoFocus disabled={pending} onClick={onCancel} className="flex-1 rounded-full bg-surface py-2.5 text-sm font-medium ring-1 ring-hairline disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" disabled={pending} onClick={onConfirm} className="flex-1 rounded-full bg-destructive/15 py-2.5 text-sm font-semibold text-destructive ring-1 ring-destructive/30 disabled:opacity-50">
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
