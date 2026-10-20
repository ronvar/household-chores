"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Prompt = { title: string; description: string; action: string; destructive?: boolean };

export default function useConfirmationPrompt() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const finish = useCallback((confirmed: boolean) => {
    resolve.current?.(confirmed);
    resolve.current = null;
    setPrompt(null);
  }, []);
  const confirmAction = useCallback((next: Prompt) => new Promise<boolean>((nextResolve) => {
    resolve.current?.(false);
    resolve.current = nextResolve;
    setPrompt(next);
  }), []);
  useEffect(() => () => { resolve.current?.(false); }, []);

  const confirmationPrompt = <Dialog open={!!prompt} onOpenChange={(open) => { if (!open) finish(false); }}>
    <DialogContent className="editor-dialog confirmation-prompt" showCloseButton={false}>
      <DialogHeader><DialogTitle>{prompt?.title}</DialogTitle><DialogDescription>{prompt?.description}</DialogDescription></DialogHeader>
      <div className="confirmation-prompt-actions"><button type="button" autoFocus onClick={() => finish(false)}>Cancel</button><button type="button" className={prompt?.destructive ? "destructive" : ""} onClick={() => finish(true)}>{prompt?.action}</button></div>
    </DialogContent>
  </Dialog>;
  return { confirmAction, confirmationPrompt };
}
