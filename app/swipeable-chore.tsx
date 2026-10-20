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
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; input: "touch" | "pointer"; x: number; y: number; start: number; width: number; axis: "x" | "y" | null; offset: number } | null>(null);
  const touchHandlers = useRef<{ start: (event: TouchEvent) => void; move: (event: TouchEvent) => void; end: (event: TouchEvent) => void; cancel: () => void } | null>(null);
  const suppressClick = useRef(false);
  const helpId = useId();
  const enabled = !disabled && (canComplete || canTrade);
  const actionWidth = 88;

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const startTouch = (event: TouchEvent) => touchHandlers.current?.start(event);
    const moveTouch = (event: TouchEvent) => touchHandlers.current?.move(event);
    const endTouch = (event: TouchEvent) => touchHandlers.current?.end(event);
    const cancelTouch = () => touchHandlers.current?.cancel();
    element.addEventListener("touchstart", startTouch, { passive: true });
    element.addEventListener("touchmove", moveTouch, { passive: false });
    element.addEventListener("touchend", endTouch, { passive: false });
    element.addEventListener("touchcancel", cancelTouch, { passive: true });
    return () => {
      element.removeEventListener("touchstart", startTouch);
      element.removeEventListener("touchmove", moveTouch);
      element.removeEventListener("touchend", endTouch);
      element.removeEventListener("touchcancel", cancelTouch);
    };
  }, []);

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
    if (event.pointerType === "touch" || !enabled || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("a, button, input, select")) return;
    beginGesture(event.pointerId, "pointer", event.clientX, event.clientY, event.currentTarget.clientWidth);
  }

  function beginGesture(id: number, input: "touch" | "pointer", x: number, y: number, width: number) {
    suppressClick.current = false;
    gesture.current = { id, input, x, y, start: offset, offset, width, axis: null };
  }

  function moveGesture(id: number, x: number, y: number) {
    const current = gesture.current;
    if (!current || current.id !== id) return false;
    const deltaX = x - current.x;
    const deltaY = y - current.y;
    if (!current.axis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 4) return false;
      if (Math.abs(deltaX) > Math.abs(deltaY) * 1.15) current.axis = "x";
      else if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) current.axis = "y";
      else return false;
      if (current.axis === "y") { close(); return false; }
      setDragging(true);
      suppressClick.current = true;
    }
    const requested = current.start + deltaX;
    const next = Math.max(canComplete ? -current.width : 0, Math.min(canTrade ? current.width : 0, requested));
    current.offset = next;
    setOffset(next);
    setArmed(Math.abs(next) >= Math.max(140, current.width * .58));
    return true;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || gesture.current?.input !== "pointer") return;
    if (moveGesture(event.pointerId, event.clientX, event.clientY) && !event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (event.pointerType === "touch" || gesture.current?.input !== "pointer") return;
    finishGesture(event.pointerId, cancelled);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function finishGesture(id: number, cancelled = false) {
    const current = gesture.current;
    if (!current || current.id !== id) return;
    gesture.current = null;
    setDragging(false);
    setArmed(false);
    if (cancelled || current.axis !== "x") { setOffset(0); return; }
    if (Math.abs(current.offset) >= Math.max(140, current.width * .58)) {
      setOffset(0);
      if (current.offset < 0 && canComplete) onComplete();
      else if (current.offset > 0 && canTrade) onTrade();
    } else setOffset(Math.abs(current.offset) > 36 ? Math.sign(current.offset) * actionWidth : 0);
  }

  touchHandlers.current = {
    start(event) {
      if (!enabled || event.touches.length !== 1) { close(); return; }
      if ((event.target as Element).closest("a, button, input, select")) return;
      const touch = event.touches[0];
      beginGesture(touch.identifier, "touch", touch.clientX, touch.clientY, surface.current?.clientWidth ?? 0);
    },
    move(event) {
      if (gesture.current?.input !== "touch") return;
      if (event.touches.length !== 1) { close(); return; }
      const touch = Array.from(event.touches).find((item) => item.identifier === gesture.current?.id);
      if (touch && moveGesture(touch.identifier, touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
    },
    end(event) {
      if (gesture.current?.input !== "touch") return;
      const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture.current?.id);
      if (!touch) return;
      if (gesture.current.axis === "x" && event.cancelable) event.preventDefault();
      finishGesture(touch.identifier);
    },
    cancel: close,
  };

  return <div ref={root} className={`${styles.root} ${dragging ? styles.dragging : ""} ${armed ? styles.armed : ""}`} data-swipe-chore="" data-swipe-open={offset < 0 ? "complete" : offset > 0 ? "trade" : undefined}>
    {canComplete && <button type="button" className={`${styles.action} ${styles.complete}`} style={{ width: Math.max(actionWidth, -offset) }} tabIndex={enabled && offset < 0 ? 0 : -1} aria-hidden={!enabled || offset >= 0} disabled={!enabled || offset >= 0} aria-label={`${completed ? "Reopen" : "Complete"} ${title}`} onClick={() => { close(); onComplete(); }}>{completed ? <RotateCcw size={24} /> : <Check size={25} />}<span>{completed ? "Reopen" : "Complete"}</span></button>}
    {canTrade && <button type="button" className={`${styles.action} ${styles.trade}`} style={{ width: Math.max(actionWidth, offset) }} tabIndex={enabled && offset > 0 ? 0 : -1} aria-hidden={!enabled || offset <= 0} disabled={!enabled || offset <= 0} aria-label={`Trade ${title}`} onClick={() => { close(); onTrade(); }}><ArrowLeftRight size={23} /><span>Trade</span></button>}
    <div ref={surface} className={styles.surface} style={{ "--swipe-offset": `${offset}px` } as CSSProperties} tabIndex={enabled ? 0 : undefined} role={enabled ? "group" : undefined} aria-label={enabled ? `${title} actions` : undefined} aria-describedby={enabled ? helpId : undefined} onPointerDown={start} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { if (gesture.current?.input === "pointer") close(); }} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }} onKeyDown={(event) => {
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
