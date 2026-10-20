"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { appVersion } from "@/lib/app-version";
import useConfirmationPrompt from "./confirmation-prompt";

async function latestVersion() {
  const response = await fetch(`/api/version?check=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Could not check for updates.");
  const result = await response.json() as { version?: unknown };
  if (typeof result.version !== "string" || !result.version) throw new Error("Could not check for updates.");
  return result.version;
}

export default function AppUpdates({ disabled, hasDraft, automaticBlocked, currentTab }: { disabled: boolean; hasDraft: boolean; automaticBlocked: boolean; currentTab: string }) {
  const { confirmAction, confirmationPrompt } = useConfirmationPrompt();
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const checking = useRef(false);
  const refreshInProgress = useRef(false);
  const lastInteraction = useRef(Date.now());
  const guards = useRef({ disabled, hasDraft, automaticBlocked, currentTab });
  guards.current = { disabled, hasDraft, automaticBlocked, currentTab };
  const attemptedVersion = useRef<string | null>(null);

  useEffect(() => {
    const recordInteraction = () => { lastInteraction.current = Date.now(); };
    const events = ["pointerdown", "keydown", "input", "wheel", "touchstart"];
    for (const event of events) window.addEventListener(event, recordInteraction, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, recordInteraction);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function check() {
      if (document.visibilityState !== "visible" || checking.current) return;
      checking.current = true;
      try {
        const version = await latestVersion();
        if (active) {
          setAvailableVersion(version !== appVersion ? version : null);
          setError("");
        }
      } catch {
      } finally {
        checking.current = false;
      }
    }
    void check();
    const timer = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  const refresh = useCallback(async (automatic = false) => {
    const canAutoRefresh = () => !guards.current.disabled && !guards.current.hasDraft && !guards.current.automaticBlocked && document.visibilityState === "visible" && Date.now() - lastInteraction.current >= 10000 && !document.querySelector('[role="dialog"][data-state="open"]');
    if (guards.current.disabled || refreshInProgress.current || (automatic && !canAutoRefresh())) return;
    if (!automatic && guards.current.hasDraft && !await confirmAction({ title: "Refresh the app?", description: "Unsaved edits will be discarded.", action: "Refresh" })) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    setError("");
    try {
      const version = await latestVersion();
      if (automatic && (version === appVersion || !canAutoRefresh())) return;
      if (automatic) {
        const lastAttempt = sessionStorage.getItem("household.autoRefreshAttempt");
        if (attemptedVersion.current === version || lastAttempt === version) return;
      }
      if ("serviceWorker" in navigator) {
        await Promise.race([
          navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {}),
          new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
      }
      if (automatic && !canAutoRefresh()) return;
      sessionStorage.setItem("household.resumeTab", guards.current.currentTab);
      if (automatic) {
        attemptedVersion.current = version;
        sessionStorage.setItem("household.autoRefreshAttempt", version);
      }
      const url = new URL(window.location.href);
      url.searchParams.set("app-refresh", String(Date.now()));
      window.location.replace(url.href);
    } catch {
      setError("Couldn’t refresh. Check your connection and try again.");
    } finally {
      refreshInProgress.current = false;
      setRefreshing(false);
    }
  }, [confirmAction]);

  useEffect(() => {
    if (!availableVersion || disabled || hasDraft || automaticBlocked || refreshing || error) return;
    if (attemptedVersion.current === availableVersion || sessionStorage.getItem("household.autoRefreshAttempt") === availableVersion) return;
    const timer = window.setInterval(() => { void refresh(true); }, 1000);
    return () => window.clearInterval(timer);
  }, [availableVersion, disabled, hasDraft, automaticBlocked, refreshing, error, refresh]);

  return <>
    {confirmationPrompt}
    <button className={`app-refresh-button ${availableVersion ? "update-ready" : ""}`} onClick={() => refresh()} disabled={disabled || refreshing} aria-label={availableVersion ? "Refresh app to install update" : "Refresh app"} title={availableVersion ? "Update available — refresh app" : "Refresh app"}>
      {refreshing ? <LoaderCircle className="trade-spinner" size={19} /> : <RefreshCw size={19} />}
      {availableVersion && <span className="app-update-dot" />}
    </button>
    {(availableVersion || error) && createPortal(<div className="app-update-notice" role="status"><div><strong>{error ? "Refresh unavailable" : "An app update is ready"}</strong><p>{error || (hasDraft || automaticBlocked || disabled ? "We’ll update automatically after you finish." : "Updating automatically when you’re idle.")}</p></div><button onClick={() => refresh()} disabled={disabled || refreshing}>{refreshing ? "Refreshing…" : error ? "Try again" : "Refresh"}</button></div>, document.body)}
  </>;
}
