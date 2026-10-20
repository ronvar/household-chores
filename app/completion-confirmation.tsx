"use client";

import { Check, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Props = {
  title?: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function CompletionConfirmation({ title, busy, error, onCancel, onConfirm }: Props) {
  return <Dialog open={!!title} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
    <DialogContent className="completion-dialog" showCloseButton={false} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <div className="completion-dialog-copy">
        <span className="completion-dialog-icon" aria-hidden="true"><Check size={28} /></span>
        <DialogTitle>Mark as completed?</DialogTitle>
        <DialogDescription><strong>{title}</strong><span>Confirm you’ve finished this chore. You can undo this from Completed.</span></DialogDescription>
        {error && <p className="completion-dialog-error" role="alert">{error}</p>}
      </div>
      <div className="completion-dialog-actions">
        <button type="button" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="completion-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy ? <><LoaderCircle size={17} aria-hidden="true" /> Saving…</> : <><Check size={18} aria-hidden="true" /> Complete</>}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
