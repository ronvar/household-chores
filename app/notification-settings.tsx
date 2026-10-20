"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function keyBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function subscribeToNotifications(personId: number) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed on this device.");
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch("/api/notifications");
  const { publicKey } = await keyResponse.json() as { publicKey: string | null };
  if (!publicKey) throw new Error("Push reminders are not configured yet.");
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId, subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  if (!response.ok) throw new Error("Could not save this device's reminders.");
}

export function NotificationOnboarding({ personId, personName }: { personId: number | null; personName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!personId || localStorage.getItem("household.notificationOnboardingSeen.v1")) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!standalone || !available || Notification.permission !== "default") return;
    Promise.all([
      fetch("/api/notifications").then((response) => response.json() as Promise<{ publicKey: string | null }>),
      navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()),
    ]).then(([configuration, subscription]) => {
      if (configuration.publicKey && !subscription) setOpen(true);
    }).catch(() => {});
  }, [personId]);

  function dismiss() {
    localStorage.setItem("household.notificationOnboardingSeen.v1", "1");
    setOpen(false);
  }

  async function allow() {
    if (!personId) return;
    setBusy(true);
    setMessage("");
    try {
      await subscribeToNotifications(personId);
      dismiss();
    } catch (error) {
      localStorage.setItem("household.notificationOnboardingSeen.v1", "1");
      setMessage(error instanceof Error ? error.message : "Could not enable reminders.");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) dismiss(); }}><DialogContent className="editor-dialog notification-onboarding"><DialogHeader><div className="notification-onboarding-icon"><Bell size={25} /></div><DialogTitle>Stay on top of your chores</DialogTitle><DialogDescription>Household works best with notifications. Allow them to get quiet reminders when {personName}&apos;s chores are due or overdue.</DialogDescription></DialogHeader>{message && <div className="error-banner" role="alert">{message}</div>}<div className="notification-onboarding-actions"><Button variant="outline" disabled={busy} onClick={dismiss}>Not now</Button><Button disabled={busy} onClick={allow}>{busy ? "Turning on…" : "OK"}</Button></div></DialogContent></Dialog>;
}

export default function NotificationSettings({ personId, personName }: { personId: number | null; personName: string }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [badgeEnabled, setBadgeEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!available) return;
    fetch("/api/notifications").then((response) => response.json() as Promise<{ publicKey: string | null }>).then((result) => setConfigured(!!result.publicKey)).catch(() => {});
    navigator.serviceWorker.ready.then(async (registration) => {
      setSupported(true);
      setBadgeEnabled(Notification.permission === "granted");
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || !personId) {
        setEnabled(false);
        return;
      }
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId, subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      setEnabled(response.ok);
      if (!response.ok) setMessage("This device needs to reconnect its reminders. Tap Turn on.");
    }).catch(() => {});
  }, [personId]);

  async function enable() {
    if (!personId) return;
    setBusy(true);
    setMessage("");
    try {
      await subscribeToNotifications(personId);
      setBadgeEnabled(true);
      setEnabled(true);
      setMessage(`Daily reminders are on for ${personName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable reminders.");
    } finally { setBusy(false); }
  }

  async function enableBadge() {
    setMessage("");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage("Notifications were not allowed on this device.");
      return;
    }
    setBadgeEnabled(true);
    window.dispatchEvent(new Event("household:badge-sync"));
    setMessage("Reminder badges clear when you open the app. Pending trade requests keep their badge until you respond.");
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("Could not turn off reminders.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Reminders are off on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn off reminders.");
    } finally { setBusy(false); }
  }

  async function testReminder() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("Turn on reminders before sending a test.");
      const response = await fetch("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) throw new Error("The test notification could not be delivered.");
      setMessage("Test sent. It should arrive in a few seconds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The test notification could not be delivered.");
    } finally { setBusy(false); }
  }

return <section className="manage-card notification-card"><div className="manage-head"><div><h2><Bell size={18} /> Reminders</h2><p>Due-day nudges around 10 am, 2 pm, and 6 pm in your device’s local time. Overdue catch-up reminders arrive at 6 pm. Reminder badges clear when you open the app; trade badges stay until you respond.</p></div><div className="notification-actions">{enabled && <Button size="sm" variant="outline" disabled={busy} onClick={testReminder}>Send test</Button>}{supported && configured && personId ? <Button size="sm" variant={enabled ? "outline" : "default"} disabled={busy} onClick={enabled ? disable : enable}>{enabled ? "Turn off" : "Turn on"}</Button> : supported && !configured && !badgeEnabled && personId ? <Button size="sm" onClick={enableBadge}>Enable badge</Button> : null}</div></div><div className="notification-note">{!supported ? "On iPhone, add this site to your Home Screen and open it from the new icon to turn on reminders." : !configured ? badgeEnabled ? "Icon badge is on while you use the app. Background reminders are being set up." : "Enable your Home Screen badge now. Background reminders are being set up." : !personId ? "Choose your person first." : enabled ? `This device is subscribed for ${personName}.` : "Reminders are optional and specific to this device."}{message && <p role="status">{message}</p>}</div></section>;
}
