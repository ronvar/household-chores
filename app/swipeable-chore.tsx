"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ArrowLeftRight, Check, RotateCcw } from "lucide-react";
import styles from "./swipeable-chore.module.css";

type Props = {
  children: ReactNode;
  title: string;
  canComplete: boolean;
  canTrade: boolean;
  completed?: boolean;
  disabled?: boolean;
  resetKey: string;
  onComplete: () => void;
  onTrade: () => void;
};

export default function SwipeableChore({ children, title, canComplete, canTrade, completed = false, disabled = false, resetKey, onComplete, onTrade }: Props) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; start: number; width: number; axis: "x" | "y" | null; offset: number } | null>(null);
  const suppressClick = useRef(false);
  const helpId = useId();
  const enabled = !disabled && (canComplete || canTrade);
  const actionWidth = 88;

  function close() {
    gesture.current = null;
    setDragging(false);
    setArmed(false);
    setOffset(0);
  }

  useEffect(() => { close(); }, [resetKey, disabled, canComplete, canTrade]);

  useEffect(() => {
    if (!offset || dragging) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const dismissOnScroll = () => close();
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("scroll", dismissOnScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("scroll", dismissOnScroll, true);
    };
  }, [offset, dragging]);

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("a, input, select")) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: offset, offset, width: event.currentTarget.clientWidth, axis: null };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const deltaX = event.clientX - current.x;
    const deltaY = event.clientY - current.y;
    if (!current.axis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;
      current.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? "x" : "y";
      if (current.axis === "y") { gesture.current = null; return; }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      suppressClick.current = true;
    }
    const requested = current.start + deltaX;
    const next = Math.max(canComplete ? -current.width : 0, Math.min(canTrade ? current.width : 0, requested));
    current.offset = next;
    setOffset(next);
    setArmed(Math.abs(next) >= Math.max(140, current.width * .58));
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    setArmed(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled || current.axis !== "x") { setOffset(0); return; }
    if (Math.abs(current.offset) >= Math.max(140, current.width * .58)) {
      setOffset(0);
      if (current.offset < 0 && canComplete) onComplete();
      else if (current.offset > 0 && canTrade) onTrade();
    } else setOffset(Math.abs(current.offset) > 36 ? Math.sign(current.offset) * actionWidth : 0);
  }

  return <div ref={root} className={`${styles.root} ${dragging ? styles.dragging : ""} ${armed ? styles.armed : ""}`} data-swipe-chore="" data-swipe-open={offset < 0 ? "complete" : offset > 0 ? "trade" : undefined}>
    {canComplete && <button type="button" className={`${styles.action} ${styles.complete}`} style={{ width: Math.max(actionWidth, -offset) }} tabIndex={enabled && offset < 0 ? 0 : -1} aria-hidden={!enabled || offset >= 0} disabled={!enabled || offset >= 0} aria-label={`${completed ? "Reopen" : "Complete"} ${title}`} onClick={() => { close(); onComplete(); }}>{completed ? <RotateCcw size={24} /> : <Check size={25} />}<span>{completed ? "Reopen" : "Complete"}</span></button>}
    {canTrade && <button type="button" className={`${styles.action} ${styles.trade}`} style={{ width: Math.max(actionWidth, offset) }} tabIndex={enabled && offset > 0 ? 0 : -1} aria-hidden={!enabled || offset <= 0} disabled={!enabled || offset <= 0} aria-label={`Trade ${title}`} onClick={() => { close(); onTrade(); }}><ArrowLeftRight size={23} /><span>Trade</span></button>}
    <div className={styles.surface} style={{ "--swipe-offset": `${offset}px` } as CSSProperties} tabIndex={enabled ? 0 : undefined} role={enabled ? "group" : undefined} aria-label={enabled ? `${title} actions` : undefined} aria-describedby={enabled ? helpId : undefined} onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { if (gesture.current) close(); }} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }} onKeyDown={(event) => {
      if (event.target !== event.currentTarget || !enabled) return;
      if (event.key === "ArrowLeft" && canComplete) { event.preventDefault(); setOffset(-actionWidth); }
      if (event.key === "ArrowRight" && canTrade) { event.preventDefault(); setOffset(actionWidth); }
      if (event.key === "Escape") close();
      if (event.key === "Enter" && offset !== 0) {
        event.preventDefault();
        close();
        if (offset < 0 && canComplete) onComplete();
        else if (offset > 0 && canTrade) onTrade();
      }
    }}>
      {children}
      {enabled && <span id={helpId} className={styles.srOnly}>{canComplete ? `Swipe left or press left arrow, then Enter to ${completed ? "reopen" : "complete"}. ` : ""}{canTrade ? "Swipe right or press right arrow, then Enter to trade." : ""}</span>}
      {enabled && <span className={styles.accessibleActions}>{canComplete && <button type="button" onClick={onComplete}>{completed ? "Reopen" : "Complete"} {title}</button>}{canTrade && <button type="button" onClick={onTrade}>Trade {title}</button>}</span>}
    </div>
  </div>;
}
