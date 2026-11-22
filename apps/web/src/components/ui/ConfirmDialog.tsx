"use client";

import { Coins } from "lucide-react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Spend confirmations show an estimate first, e.g. "About 40 credits". */
  costLine?: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  costLine,
  confirmLabel = "Confirm",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="md">
      <p className="text-sm text-muted-foreground">{message}</p>
      {costLine && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Coins className="h-3.5 w-3.5" />
          {costLine}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-fill-tertiary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={
            destructive
              ? "rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              : "rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-ctaText hover:opacity-90 disabled:opacity-50"
          }
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
