"use client";

import { Glass } from "@samasante/liquid-glass";
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
      <Glass className="completion-dialog-glass" aria-hidden="true" radius={28} optics={{ frost: 2, saturate: 1.12, brightness: 0, strength: 0.025, depth: 0.4, curvature: 0.16, dispersion: 0.18, bend: 0.28, bendWidth: 0.14, splay: 0, specular: 1.15, sheen: 0.4, sheenWidth: 4, sheenFalloff: 1.5, glow: 0.16, glowSpread: 1, glowFalloff: 0.5 }}><span className="glass-surface-fill" /></Glass>
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
