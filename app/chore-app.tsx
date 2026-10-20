"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Glass } from "@samasante/liquid-glass";
import { ArrowLeftRight, ArrowUpDown, CalendarDays, Camera, Check, ChevronDown, ChevronRight, Clock3, Heart, History, House, LayoutGrid, List, ListFilter, LoaderCircle, Plus, RefreshCw, RotateCcw, Sparkles, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import NotificationSettings, { NotificationOnboarding } from "./notification-settings";
import AppUpdates from "./app-updates";
import ChoreCalendar from "./chore-calendar";
import { canTradeAssignment, completedInHouseholdWeek, completedOnTime, completionStatus } from "../lib/chore-schedule";

type Person = { id: number; name: string; active: number; profile_image: string | null };
type Chore = { id: number; title: string; emoji: string; points: number; frequency: string; days: string; active: number };
type Assignment = { id: number; chore_id: number; person_id: number; scheduled_date: string; due_date: string; available_date?: string; repeated?: boolean; earlier_schedule?: boolean; completed_at: string | null; completed_by_person_id?: number | null; completed_by_name?: string | null; title_snapshot: string; points_snapshot: number; person_name: string; emoji: string };
type BoardEvent = { id: number; actor_name: string; message: string; created_at: string };
type PersonRequest = { id: number; name: string; status: string; person_id: number | null };
type Preference = { person_id: number; chore_id: number; strength: number; updated_at: string };
type Trade = { id: number; requester_id: number; recipient_id: number; offered_assignment_id: number; requested_assignment_id: number; status: string; created_at: string; responded_at: string | null; requester_name: string; recipient_name: string; offered_title: string; requested_title: string };
type State = { today: string; weekStart: string; people: Person[]; chores: Chore[]; assignments: Assignment[]; events: BoardEvent[]; pendingRequests: PersonRequest[]; preferences: Preference[]; trades: Trade[]; myRequest: PersonRequest | null; isRonApprover: boolean; approvalConfigured: boolean };
type ChoreDraft = { id?: number; title: string; emoji: string; points: number; frequency: string; days: number[] };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const personColors = ["#ddece4", "#e5e8f5", "#faeadc", "#e8e2ef", "#dcecec"];

function PersonAvatar({ person, index, className = "" }: { person: Person; index: number; className?: string }) {
  return <span className={`avatar ${className}`} style={{ background: personColors[index % personColors.length] }}>{person.profile_image ? <img src={person.profile_image} alt="" /> : person.name.charAt(0).toUpperCase()}</span>;
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function windowDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function schedule(chore: Chore) {
  if (chore.frequency === "weekly") return "Every week";
  if (chore.frequency === "biweekly") return "Every other week";
  if (chore.frequency === "monthly") return "Every month";
  if (chore.frequency === "bimonthly") return "Every two months";
  return chore.days.split(",").map((day) => weekdays[Number(day)]).join(", ");
}

export default function ChoreApp() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("board");
  const [boardView, setBoardView] = useState<"calendar" | "list">("calendar");
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [personFilter, setPersonFilter] = useState<number | "all">("all");
  const [devicePersonId, setDevicePersonId] = useState<number | null | undefined>(undefined);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [choreDraft, setChoreDraft] = useState<ChoreDraft | null>(null);
  const [personDraft, setPersonDraft] = useState<{ id?: number; name: string } | null>(null);
  const [tradeDraft, setTradeDraft] = useState<{ offeredAssignmentId: number; requestedAssignmentId: number | null } | null>(null);
  const [tradeConfirmation, setTradeConfirmation] = useState<{ id: number; action: "acceptTrade" | "declineTrade" | "cancelTrade" } | null>(null);
  const [sortBy, setSortBy] = useState<"due" | "name" | "points">("due");
  const [pointsFilter, setPointsFilter] = useState<"all" | number>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "completed">("all");
  const [confirmingAssignmentId, setConfirmingAssignmentId] = useState<number | null>(null);
  const [completionHistoryLimit, setCompletionHistoryLimit] = useState(20);
  const [newPreference, setNewPreference] = useState<{ choreId: number | ""; strength: number } | null>(null);
  const [preferenceEdits, setPreferenceEdits] = useState<Record<number, number>>({});
  const [reassignDraft, setReassignDraft] = useState<{ action: string; title: string; description: string } | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<{ id: number | null; personId: number | null; reopen: boolean; confirming: boolean; expectedPersonId: number | null; expectedCompletedAt: string | null } | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const savedRequest = window.localStorage.getItem("household.requestId");
      const response = await fetch(`/api/household?today=${localDate()}${savedRequest ? `&requestId=${encodeURIComponent(savedRequest)}` : ""}&refresh=${Date.now()}`, { cache: "no-store" });
      const result = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(result.error);
      if (sequence !== loadSequence.current) return;
      setData(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the household.");
    }
  }, []);

  useEffect(() => {
    const resumeTab = window.sessionStorage.getItem("household.resumeTab");
    if (resumeTab && ["board", "history", "me", "manage"].includes(resumeTab)) setTab(resumeTab);
    window.sessionStorage.removeItem("household.resumeTab");
    const savedView = window.localStorage.getItem("household.choreView");
    if (savedView === "calendar" || savedView === "list") setBoardView(savedView);
    const savedPerson = Number(window.localStorage.getItem("household.personId"));
    setDevicePersonId(Number.isInteger(savedPerson) && savedPerson > 0 ? savedPerson : null);
    setPersonFilter(Number.isInteger(savedPerson) && savedPerson > 0 ? savedPerson : "all");
    load();
  }, [load]);

  useEffect(() => {
    if (statusFilter === "completed") setCompletedExpanded(true);
  }, [statusFilter]);

  function chooseBoardView(view: "calendar" | "list") {
    setBoardView(view);
    setConfirmingAssignmentId(null);
    try {
      window.localStorage.setItem("household.choreView", view);
    } catch {}
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!data || devicePersonId === undefined || !("setAppBadge" in navigator) || !("clearAppBadge" in navigator)) return;
    const syncBadge = () => {
      if (document.visibilityState !== "visible") return;
      const count = data.trades.filter((trade) => trade.status === "pending" && trade.recipient_id === devicePersonId).length;
      const update = count ? navigator.setAppBadge(count) : navigator.clearAppBadge();
      update.catch(() => {});
    };
    syncBadge();
    window.addEventListener("focus", syncBadge);
    window.addEventListener("household:badge-sync", syncBadge);
    document.addEventListener("visibilitychange", syncBadge);
    return () => {
      window.removeEventListener("focus", syncBadge);
      window.removeEventListener("household:badge-sync", syncBadge);
      document.removeEventListener("visibilitychange", syncBadge);
    };
  }, [data, devicePersonId]);

  useEffect(() => {
    if (!devicePersonId || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((registration) => registration.pushManager?.getSubscription()).then((subscription) => {
      if (!subscription) return;
      return fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: devicePersonId, subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    }).catch(() => {});
  }, [devicePersonId]);

  useEffect(() => {
    if (!data || devicePersonId === undefined) return;
    if (devicePersonId && !data.people.some((person) => person.id === devicePersonId && person.active)) {
      window.localStorage.removeItem("household.personId");
      setDevicePersonId(null);
      setPersonFilter("all");
    }
    if (!devicePersonId && data.myRequest?.status === "approved" && data.myRequest.person_id) {
      choosePerson(data.myRequest.person_id);
    }
  }, [data, devicePersonId]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = window.setInterval(refresh, 3000);
    const onPush = (event: MessageEvent) => {
      if (event.data?.type === "household:push") refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onPush);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      navigator.serviceWorker?.removeEventListener("message", onPush);
    };
  }, [load]);

  function choosePerson(personId: number) {
    window.localStorage.setItem("household.personId", String(personId));
    window.localStorage.removeItem("household.requestId");
    setDevicePersonId(personId);
    setPersonFilter(personId);
    setShowPersonPicker(false);
  }

  function navigate(nextTab: string) {
    if (tab === nextTab) window.scrollTo({ top: 0, behavior: "smooth" });
    else {
      setTab(nextTab);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    }
  }

  async function updateProfileImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5_000_000) {
      setError("Choose an image under 5 MB.");
      return;
    }
    const bitmap = await createImageBitmap(file);
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    bitmap.close();
    await act({ action: "saveProfileImage", profileImage: canvas.toDataURL("image/jpeg", 0.82) });
  }

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorPersonId: devicePersonId, ...payload }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error);
      await load();
      setChoreDraft(null);
      setPersonDraft(null);
      setTradeDraft(null);
      setTradeConfirmation(null);
      setAssignmentDraft(null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your change.");
    } finally {
      setBusy(false);
    }
  }

  async function requestPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "requestPerson", name: requestName }) });
      const result = await response.json() as { error?: string; requestId?: number };
      if (!response.ok || !result.requestId) throw new Error(result.error ?? "Could not send the request.");
      window.localStorage.setItem("household.requestId", String(result.requestId));
      setRequestName("");
      await load();
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  }

  const activePeople = useMemo(() => data?.people.filter((person) => person.active) ?? [], [data]);
  const currentPerson = activePeople.find((person) => person.id === devicePersonId) ?? null;
  const currentPersonIndex = Math.max(0, activePeople.findIndex((person) => person.id === devicePersonId));
  const weeklyProgressAssignments = useMemo(() => data?.assignments.filter((assignment) => (assignment.scheduled_date >= data.weekStart && assignment.scheduled_date <= addDays(data.weekStart, 6)) || completedInHouseholdWeek(assignment.completed_at, data.weekStart)) ?? [], [data]);
  useEffect(() => {
    if (!data || confirmingAssignmentId === null) return;
    const assignment = data.assignments.find((item) => item.id === confirmingAssignmentId);
    if (!assignment || completionStatus(assignment, data.today, data.weekStart) !== "available") setConfirmingAssignmentId(null);
  }, [data, confirmingAssignmentId]);
  const completed = weeklyProgressAssignments.filter((assignment) => assignment.completed_at).length;
  const progress = weeklyProgressAssignments.length ? Math.round(completed / weeklyProgressAssignments.length * 100) : 0;
  const selected = (assignments: Assignment[]) => personFilter === "all" ? assignments : assignments.filter((assignment) => assignment.person_id === personFilter);
  const history = selected(data?.assignments.filter((assignment) => assignment.completed_at).sort((left, right) => right.completed_at!.localeCompare(left.completed_at!)) ?? []).slice(0, 80);
  const openAssignments = data?.assignments.filter((assignment) => !assignment.completed_at) ?? [];
  const tradableAssignments = openAssignments.filter((item) => canTradeAssignment(item, data!.today, data!.weekStart));
  const myTrades = data?.trades.filter((trade) => trade.status === "pending" && (trade.requester_id === devicePersonId || trade.recipient_id === devicePersonId)) ?? [];
  const actionableTradeCount = myTrades.filter((trade) => trade.recipient_id === devicePersonId).length;
  const previousTrades = data?.trades.filter((trade) => trade.status !== "pending" && (trade.requester_id === devicePersonId || trade.recipient_id === devicePersonId)).slice(0, 20) ?? [];
  const myCompleted = data?.assignments.filter((assignment) => assignment.person_id === devicePersonId && assignment.completed_at) ?? [];
  const myOnTime = myCompleted.filter(completedOnTime).length;
  const completionRecord = (data?.assignments ?? []).filter((assignment) => assignment.completed_at && (personFilter === "all" || (assignment.completed_by_person_id ?? assignment.person_id) === personFilter)).sort((left, right) => right.completed_at!.localeCompare(left.completed_at!));
  const visibleCompletionRecord = boardView === "calendar" ? completionRecord.filter((assignment) => completedInHouseholdWeek(assignment.completed_at, data!.weekStart) && (pointsFilter === "all" || assignment.points_snapshot === pointsFilter)) : completionRecord;
  const onTimeScore = myCompleted.length ? Math.round(myOnTime / myCompleted.length * 100) : 0;
  const boardItems = selected(data?.assignments.filter((assignment) => (!assignment.completed_at && (assignment.due_date < data.today || (assignment.scheduled_date >= data.weekStart && assignment.scheduled_date <= addDays(data.weekStart, 6)))) || (!!assignment.completed_at && assignment.scheduled_date >= data.weekStart && assignment.scheduled_date <= addDays(data.weekStart, 6))) ?? [])
    .filter((assignment) => pointsFilter === "all" || assignment.points_snapshot === pointsFilter)
    .filter((assignment) => statusFilter === "all" || (statusFilter === "completed" ? !!assignment.completed_at : !assignment.completed_at))
    .sort((left, right) => {
      if (sortBy === "name") return left.title_snapshot.localeCompare(right.title_snapshot) || left.due_date.localeCompare(right.due_date);
      if (sortBy === "points") return left.points_snapshot - right.points_snapshot || left.due_date.localeCompare(right.due_date) || left.title_snapshot.localeCompare(right.title_snapshot);
      return left.due_date.localeCompare(right.due_date) || left.title_snapshot.localeCompare(right.title_snapshot);
    });

  function dueDescription(item: Assignment) {
    if (item.completed_at) return `Completed · original deadline ${fullDate(item.due_date)}`;
    const days = Math.round((Date.parse(`${item.due_date}T12:00:00`) - Date.parse(`${data!.today}T12:00:00`)) / 86400000);
    if (days < 0) return `Was due ${fullDate(item.due_date)}`;
    if (days === 0) return `Due today · ${fullDate(item.due_date)}`;
    return `Due ${fullDate(item.due_date)} · ${days} day${days === 1 ? "" : "s"} left`;
  }

  function taskList(items: Assignment[], empty: string, calendar = false) {
    if (!items.length) return <div className="empty-note">{empty}</div>;
return <div className="task-list">{items.map((item) => { const status = completionStatus(item, data!.today, data!.weekStart); const missed = status === "missed"; const confirming = confirmingAssignmentId === item.id && status === "available"; const daysUntilDue = Math.round((Date.parse(`${item.due_date}T12:00:00`) - Date.parse(`${data!.today}T12:00:00`)) / 86400000); const overdue = !item.completed_at && daysUntilDue < 0; const notOpen = status === "early"; const dueTone = missed ? "waiting" : notOpen ? "waiting" : item.completed_at ? "complete" : daysUntilDue <= 0 ? "urgent" : daysUntilDue <= 2 ? "soon" : "later"; const dueText = item.completed_at ? new Date(item.completed_at).toLocaleDateString(undefined, { timeZone: "America/Los_Angeles", month: "short", day: "numeric" }) : daysUntilDue === 0 ? "today" : daysUntilDue === 1 ? "tomorrow" : new Date(`${item.due_date}T12:00:00`).toLocaleDateString(undefined, Math.abs(daysUntilDue) > 6 ? { month: "short", day: "numeric" } : { weekday: "long" }); return <div data-assignment-id={item.id} className={`task-row ${item.completed_at ? "completed-row" : ""} ${missed ? "missed-row" : overdue ? "overdue-row" : ""} ${confirming ? "confirming-row" : ""}`} key={item.id}>
<button className={`task-check ${item.completed_at ? "checked" : ""} ${confirming ? "confirming" : ""}`} title={missed ? "Missed the deadline" : notOpen ? `Opens ${fullDate(item.available_date!)}. Wait until the previous turn's deadline has passed.` : dueDescription(item)} aria-label={confirming ? `Confirm ${item.title_snapshot} completed` : `${item.completed_at ? "Reopen" : "Mark"} ${item.title_snapshot}${item.completed_at ? "" : " done"}`} onClick={() => { if (item.completed_at) act({ action: "undo", id: item.id }); else if (confirming) { setConfirmingAssignmentId(null); act({ action: "complete", id: item.id }); } else setConfirmingAssignmentId(item.id); }} disabled={busy || missed || notOpen || item.person_id !== devicePersonId}>{!item.completed_at && !confirming ? <><span className="task-emoji">{item.emoji}</span><Check className="hover-check" size={17} /></> : <Check size={17} />}</button>
      <span className="cancel-slot"><button className="cancel-complete" aria-label={`Cancel completing ${item.title_snapshot}`} onClick={() => setConfirmingAssignmentId(null)} disabled={!confirming || busy}><X size={17} /></button></span>
<div className="task-main"><strong>{item.title_snapshot}</strong><span>{confirming ? "Confirm completed?" : <>{item.person_name} <span className="dot-separator">·</span> {item.points_snapshot} pt{item.points_snapshot === 1 ? "" : "s"}</>}</span>{item.completed_at ? <span className="task-window">Original deadline {fullDate(item.due_date)}</span> : item.repeated && item.available_date ? <span className="task-window" title={`Start after the previous turn ends. Complete between ${fullDate(item.available_date)} and ${fullDate(item.due_date)}. This week's missed turns are closed; previous-week overdue chores can still be completed.`}>{overdue ? `Missed window: ${windowDate(item.available_date)} to ${windowDate(item.due_date)}` : item.available_date === item.due_date ? `Complete on ${windowDate(item.due_date)}` : `Complete between ${windowDate(item.available_date)} and ${windowDate(item.due_date)}`}</span> : null}{missed && item.repeated && <span className="task-schedule-note">Missed turn · assigned to you again next week</span>}{item.earlier_schedule && <span className="task-schedule-note">Original schedule · deadline unchanged</span>}</div>
{!item.completed_at && item.person_id === devicePersonId && tradableAssignments.some((candidate) => candidate.person_id !== devicePersonId && candidate.chore_id !== item.chore_id) && <button className="trade-action" disabled={missed || confirming || busy} onClick={() => setTradeDraft({ offeredAssignmentId: item.id, requestedAssignmentId: null })}><ArrowLeftRight size={14} /> Trade</button>}
{calendar ? <span className="calendar-owner-avatar" aria-hidden="true">{data!.people.find((person) => person.id === item.person_id) ? <PersonAvatar person={data!.people.find((person) => person.id === item.person_id)!} index={Math.max(0, data!.people.findIndex((person) => person.id === item.person_id))} className="small" /> : null}</span> : <span className={`due-badge ${dueTone}`} title={missed ? "Missed the deadline" : notOpen ? `Not your turn yet. Starts ${fullDate(item.available_date!)}` : dueDescription(item)}><small>{missed ? "Missed the" : notOpen ? "Not your" : item.completed_at ? "done" : overdue ? "overdue" : item.repeated ? "complete by" : "due"}</small><strong>{missed ? "deadline" : notOpen ? "turn yet" : dueText}</strong></span>}
    </div>; })}</div>;
  }

  function tradePanel() {
    if (!myTrades.length) return null;
    return <section className={`trades-panel overview-trades ${actionableTradeCount ? "needs-action" : ""}`}>
      <div className="section-line"><div><h2>Trade requests {actionableTradeCount > 0 && <span className="trade-count-badge">{actionableTradeCount}</span>}</h2><span>{actionableTradeCount ? "Waiting for your response" : "Waiting for the other person"}</span></div><ArrowLeftRight size={18} /></div>
      <div className="trade-list">{myTrades.map((trade) => {
        const confirmation = tradeConfirmation?.id === trade.id ? tradeConfirmation : null;
        const incoming = trade.recipient_id === devicePersonId;
        const participants = [
          { personId: incoming ? trade.requester_id : trade.recipient_id, name: incoming ? trade.requester_name : trade.recipient_name, title: incoming ? trade.requested_title : trade.offered_title, assignmentId: incoming ? trade.requested_assignment_id : trade.offered_assignment_id },
          { personId: devicePersonId!, name: incoming ? trade.recipient_name : trade.requester_name, title: incoming ? trade.offered_title : trade.requested_title, assignmentId: incoming ? trade.offered_assignment_id : trade.requested_assignment_id },
        ];
        return <div className={`trade-row ${confirmation ? "confirming-trade" : ""}`} key={trade.id}>
          <div className="trade-labels"><span>{participants[0].name} gets</span><span>{participants[1].name} gets</span></div>
          <div className="trade-exchange"><ArrowLeftRight className="trade-exchange-arrow" size={19} aria-hidden="true" />{participants.map((participant, index) => {
            const person = data!.people.find((candidate) => candidate.id === participant.personId) ?? { id: participant.personId, name: participant.name, active: 0, profile_image: null };
            const personIndex = Math.max(0, activePeople.findIndex((candidate) => candidate.id === participant.personId));
            const assignment = data!.assignments.find((candidate) => candidate.id === participant.assignmentId);
            return <div className={`trade-side ${index === 1 ? "trade-side-you" : "trade-side-them"}`} key={participant.personId}>
              <div className="trade-chore"><PersonAvatar person={person} index={personIndex} /><div className="trade-chore-copy"><strong>{participant.title}</strong><span>{assignment ? `${assignment.points_snapshot} effort point${assignment.points_snapshot === 1 ? "" : "s"}` : "Points unavailable"}</span></div></div>
            </div>;
          })}</div>
          <div className="trade-footer"><p aria-live="polite">{confirmation ? confirmation.action === "acceptTrade" ? "Confirm this swap?" : confirmation.action === "declineTrade" ? "Decline this trade?" : "Cancel this trade request?" : incoming ? `${trade.requester_name} would like to swap chores with you.` : `Waiting for ${trade.recipient_name} to accept.`}</p>
            <div className={`trade-buttons trade-decision-actions ${confirmation ? "trade-confirm-actions" : ""}`}>
              {confirmation ? <><button className={`trade-decision ${confirmation.action === "acceptTrade" ? "accept" : confirmation.action === "declineTrade" ? "decline" : "cancel"}`} aria-label={confirmation.action === "acceptTrade" ? "Confirm accept trade" : confirmation.action === "declineTrade" ? "Confirm decline trade" : "Confirm cancel trade"} disabled={busy} onClick={() => act({ action: confirmation.action, id: trade.id })}>{busy && <LoaderCircle className="trade-spinner" size={17} />}{confirmation.action === "acceptTrade" ? "Confirm accept" : confirmation.action === "declineTrade" ? "Confirm decline" : "Confirm cancel"}</button><button className="trade-decision cancel" aria-label="Dismiss trade confirmation" disabled={busy} onClick={() => setTradeConfirmation(null)}>Go back</button></> : incoming ? <><button className="trade-decision decline" aria-label="Decline trade" disabled={busy} onClick={() => setTradeConfirmation({ id: trade.id, action: "declineTrade" })}>Decline</button><button className="trade-decision accept" aria-label="Accept trade" disabled={busy} onClick={() => setTradeConfirmation({ id: trade.id, action: "acceptTrade" })}>Accept</button></> : <button className="trade-decision cancel" aria-label="Cancel trade request" disabled={busy} onClick={() => setTradeConfirmation({ id: trade.id, action: "cancelTrade" })}>Cancel</button>}
            </div>
          </div>
        </div>;
      })}</div>
    </section>;
  }

  return <div className="site-shell">
    <header className="topbar"><Glass className="mobile-topbar-glass" aria-hidden="true" radius={0} optics={{ frost: 2, saturate: 1.12, brightness: 0, strength: 0.025, depth: 0.4, curvature: 0.16, dispersion: 0.18, bend: 0.28, bendWidth: 0.14, splay: 0, specular: 1.1, sheen: 0.38, sheenWidth: 4, sheenFalloff: 1.5, glow: 0.14, glowSpread: 1, glowFalloff: 0.5 }}><span className="glass-surface-fill" /></Glass><div className="topbar-inner"><div className="brand"><span className="brand-mark"><Sparkles size={18} strokeWidth={1.7} /></span><span>household<span className="brand-period">.</span></span></div><div className="topbar-controls"><AppUpdates currentTab={tab} automaticBlocked={!data || devicePersonId == null || showPersonPicker || !!confirmingAssignmentId || !!tradeConfirmation || !!reassignDraft} disabled={busy} hasDraft={!!assignmentDraft || !!choreDraft || !!personDraft || !!tradeDraft || !!newPreference || Object.entries(preferenceEdits).some(([choreId, strength]) => data?.preferences.find((preference) => preference.person_id === devicePersonId && preference.chore_id === Number(choreId))?.strength !== strength)} />{currentPerson ? <button className="identity-switch" onClick={() => setShowPersonPicker(true)}><PersonAvatar person={currentPerson} index={currentPersonIndex} className="small" /><span>{currentPerson.name}</span><ChevronRight size={15} /></button> : <span className="topbar-right">A little lighter, together</span>}</div></div></header>
    <main className="layout">
      <aside className="sidebar"><div className="side-caption">YOUR SPACE</div><nav className="nav-list" aria-label="Main navigation"><button className={tab === "board" ? "nav-item active" : "nav-item"} onClick={() => navigate("board")}><LayoutGrid size={18} /> Overview{actionableTradeCount > 0 && <span className="nav-action-badge">{actionableTradeCount}</span>}</button><button className={tab === "history" ? "nav-item active" : "nav-item"} onClick={() => navigate("history")}><History size={18} /> History</button><button className={tab === "me" ? "nav-item active" : "nav-item"} onClick={() => navigate("me")}><UserRound size={18} /> Me</button><button className={tab === "manage" ? "nav-item active" : "nav-item"} onClick={() => navigate("manage")}><House size={18} /> Household</button></nav><div className="sidebar-note"><span className="note-icon"><Sparkles size={17} /></span><p>Good things happen when everyone lends a hand.</p></div></aside>
      <div className={`main-area ${tab === "manage" ? "managing" : ""}`}>
        <Glass className="mobile-nav" aria-label="Main navigation" radius={38} optics={{ frost: 2, saturate: 1.12, brightness: 0, strength: 0.025, depth: 0.4, curvature: 0.16, dispersion: 0.18, bend: 0.28, bendWidth: 0.14, splay: 0, specular: 1.15, sheen: 0.4, sheenWidth: 4, sheenFalloff: 1.5, glow: 0.16, glowSpread: 1, glowFalloff: 0.5 }}><button className={tab === "board" ? "active" : ""} onClick={() => navigate("board")}><LayoutGrid size={22} /><span>Overview</span>{actionableTradeCount > 0 && <span className="mobile-action-badge" aria-label={`${actionableTradeCount} trade request${actionableTradeCount === 1 ? "" : "s"}`}>{actionableTradeCount > 99 ? "99+" : actionableTradeCount}</span>}</button><button className={tab === "history" ? "active" : ""} onClick={() => navigate("history")}><History size={22} /><span>History</span></button><button className={tab === "me" ? "active" : ""} onClick={() => navigate("me")}>{currentPerson ? <PersonAvatar person={currentPerson} index={currentPersonIndex} className="nav-avatar" /> : <UserRound size={22} />}<span>Me</span></button><button className={tab === "manage" ? "active" : ""} onClick={() => navigate("manage")}><House size={22} /><span>Household</span></button></Glass>
        {error && <div className="error-banner" role="alert">{error} <button onClick={load}>Try again</button></div>}
        {!data ? <div className="loading">Loading your household…</div> : <>
          {tab === "board" && <><div className="page-heading"><div><div className="eyebrow">WEEK OF {displayDate(data.weekStart).toUpperCase()}</div><h1>Chores, made simple.</h1><p>A clear view of what needs doing, and who&apos;s on it.</p></div><div className="date-pill"><Clock3 size={16} /> {new Date(`${data.today}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div></div>
            {tradePanel()}
            <section className="progress-card" aria-label="Household progress"><div className="progress-top"><div><span className="section-kicker">HOUSEHOLD PROGRESS</span><h2>{completed} of {weeklyProgressAssignments.length} chores done</h2><p>Every checked box brings the week a little closer.</p></div><div className="progress-number">{progress}%</div></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div></section>
            <section className="people-section"><div className="section-line"><h2>Everyone&apos;s week</h2><span title="Includes this week’s assignments and overdue chores finished this week">Includes overdue work</span></div><div className="people-grid">{activePeople.map((person, index) => { const assigned = weeklyProgressAssignments.filter((item) => (item.completed_at ? item.completed_by_person_id ?? item.person_id : item.person_id) === person.id); const finished = assigned.filter((item) => item.completed_at).length; const totalPoints = assigned.reduce((total, item) => total + item.points_snapshot, 0); const backlogged = data.assignments.filter((item) => item.person_id === person.id && !item.completed_at && item.due_date < data.weekStart).length; return <button key={person.id} className={`person-card ${personFilter === person.id ? "chosen" : ""}`} onClick={() => setPersonFilter(personFilter === person.id ? "all" : person.id)}><div className="person-card-top"><PersonAvatar person={person} index={index} /><span className="person-points">{totalPoints} pt{totalPoints === 1 ? "" : "s"}</span></div><strong>{person.name}</strong><span>{finished} of {assigned.length} done{backlogged ? ` · ${backlogged} overdue` : ""}</span><div className="small-progress"><div style={{ width: `${assigned.length ? finished / assigned.length * 100 : 0}%` }} /></div></button>; })}</div></section>
<section className={`board-section ${boardView === "calendar" ? "calendar-board" : ""}`} data-chore-view={boardView}><div className="section-line board-line"><div><h2>{boardView === "calendar" ? (personFilter === "all" ? "This week" : `${activePeople.find((person) => person.id === personFilter)?.name}’s week`) : (personFilter === "all" ? "The chore board" : `${activePeople.find((person) => person.id === personFilter)?.name}’s chores`)}</h2><span>{boardView === "calendar" ? "Any time in the window. Finish by the deadline." : "Complete within your turn’s window. This week’s missed deadlines are locked."}</span></div><div className="board-tools"><div className="chore-view-switch" role="group" aria-label="Chore view"><button type="button" aria-pressed={boardView === "calendar"} disabled={busy} onClick={() => chooseBoardView("calendar")}><CalendarDays size={16} aria-hidden="true" /> Calendar</button><button type="button" aria-pressed={boardView === "list"} disabled={busy} onClick={() => chooseBoardView("list")}><List size={16} aria-hidden="true" /> List</button></div><div className="board-actions"><span className="live-status"><i /> Live</span><DropdownMenu><DropdownMenuTrigger asChild><Button className="board-icon-button" variant="outline" size="icon" aria-label="Sort chores"><ArrowUpDown size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent className="board-menu" align="end"><DropdownMenuLabel>Sort chores</DropdownMenuLabel><DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => setSortBy(value as "due" | "name" | "points")}><DropdownMenuRadioItem value="due">Due date · earliest</DropdownMenuRadioItem><DropdownMenuRadioItem value="name">Name · A–Z</DropdownMenuRadioItem><DropdownMenuRadioItem value="points">Points · low to high</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><DropdownMenu><DropdownMenuTrigger asChild><Button className="board-icon-button filter-button" variant="outline" size="icon" aria-label={`Filter chores${pointsFilter !== "all" || statusFilter !== "all" ? ", filters active" : ""}`}><ListFilter size={17} />{(pointsFilter !== "all" || statusFilter !== "all") && <span className="filter-indicator" />}</Button></DropdownMenuTrigger><DropdownMenuContent className="board-menu filter-menu" align="end"><DropdownMenuLabel>Effort</DropdownMenuLabel><DropdownMenuRadioGroup value={String(pointsFilter)} onValueChange={(value) => setPointsFilter(value === "all" ? "all" : Number(value))}><DropdownMenuRadioItem value="all">All points</DropdownMenuRadioItem>{[1, 2, 3, 4, 5].map((point) => <DropdownMenuRadioItem key={point} value={String(point)}>{point} point{point === 1 ? "" : "s"}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /><DropdownMenuLabel>Status</DropdownMenuLabel><DropdownMenuRadioGroup value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "todo" | "completed")}><DropdownMenuRadioItem value="all">All statuses</DropdownMenuRadioItem><DropdownMenuRadioItem value="todo">Still to do</DropdownMenuRadioItem><DropdownMenuRadioItem value="completed">Completed</DropdownMenuRadioItem></DropdownMenuRadioGroup>{(pointsFilter !== "all" || statusFilter !== "all") && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { setPointsFilter("all"); setStatusFilter("all"); }}>Clear filters</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>{personFilter !== "all" && <button className="text-action" onClick={() => setPersonFilter("all")}>Show everyone</button>}</div></div></div>
              {boardView === "calendar" ? statusFilter !== "completed" && <ChoreCalendar items={boardItems.filter((item) => !item.completed_at)} today={data.today} weekStart={data.weekStart} renderTask={(item, calendar = true) => taskList([item], "", calendar)} /> : <div className="task-panel sorted-panel">{taskList(boardItems, "No chores match these filters.")}</div>}
            </section>
{(boardView === "list" || statusFilter !== "todo") && <details className="me-section completion-history" open={completedExpanded} onToggle={(event) => setCompletedExpanded(event.currentTarget.open)}><summary><span><History size={18} /> {boardView === "calendar" ? "Completed this week" : "Completion history"} <span className="completion-count">{visibleCompletionRecord.length}</span></span><ChevronDown size={19} /></summary><div className="me-section-copy">{personFilter === "all" ? "Everyone’s record" : `${activePeople.find((person) => person.id === personFilter)?.name}’s record`} · {boardView === "calendar" ? "finished this week, including overdue chores · older records in History" : "includes past weeks"} · times shown in your local time</div><div className="completion-record">{visibleCompletionRecord.length ? visibleCompletionRecord.slice(0, completionHistoryLimit).map((item) => { const onTime = completedOnTime(item); const personId = item.completed_by_person_id ?? item.person_id; const personIndex = data.people.findIndex((person) => person.id === personId); const person = data.people[personIndex]; return <article className="completion-entry" key={item.id}>{person ? <PersonAvatar person={person} index={Math.max(0, personIndex)} className="small" /> : <span className="history-check"><Check size={16} /></span>}<div className="completion-entry-copy"><strong>{item.title_snapshot}</strong><span>{item.completed_by_name ?? item.person_name} completed it</span><time dateTime={item.completed_at!}>{new Date(item.completed_at!).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</time><span className="completion-deadline">Due {fullDate(item.due_date)}</span></div><div className="completion-entry-status"><span className={`completion-outcome ${onTime ? "on-time" : "late"}`} title="On-time status uses the household’s Pacific-time deadline">{onTime ? "On time" : "Overdue"}</span>{boardView === "calendar" && item.person_id === devicePersonId && <button className="completion-reopen" type="button" disabled={busy} aria-label={`Reopen ${item.title_snapshot}`} onClick={() => act({ action: "undo", id: item.id })}><RotateCcw size={13} aria-hidden="true" /> Undo</button>}</div></article>; }) : <div className="empty-note">{boardView === "calendar" ? "No chores completed this week. Older completions are in History." : "Completed chores will stay here, including chores from previous weeks."}</div>}</div>{visibleCompletionRecord.length > completionHistoryLimit && <button className="completion-show-more" onClick={() => setCompletionHistoryLimit((limit) => limit + 20)}>Show more completions</button>}</details>}
          </>}
          {tab === "history" && <><div className="page-heading"><div><div className="eyebrow">THE LITTLE WINS</div><h1>Chore history</h1><p>Completed work and changes to the board.</p></div></div><div className="history-stack"><div className="history-panel"><div className="history-header"><span>RECENTLY COMPLETED</span><span>{history.length} chores</span></div>{history.length ? history.map((item) => <div className="history-row" key={item.id}><span className="history-check"><Check size={16} /></span><div><strong>{item.title_snapshot}</strong><span>{item.person_name} · {new Date(item.completed_at!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></div><span className="effort">{item.points_snapshot} pt{item.points_snapshot === 1 ? "" : "s"}</span></div>) : <div className="empty-note">Completed chores will appear here.</div>}</div><div className="history-panel"><div className="history-header"><span>BOARD CHANGES</span><span>{data.events.length} updates</span></div>{data.events.length ? data.events.map((item) => { const eventPersonIndex = activePeople.findIndex((person) => person.name === item.actor_name); const eventPerson = activePeople[eventPersonIndex]; return <div className="change-row" key={item.id}>{eventPerson ? <PersonAvatar person={eventPerson} index={eventPersonIndex} className="small" /> : <span className="change-symbol"><House size={15} /></span>}<div><strong>{item.message}</strong><span>{new Date(item.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span></div></div>; }) : <div className="empty-note">Changes to chores and assignments will appear here.</div>}</div></div></>}
          {tab === "me" && <div className="tab-view"><div className="page-heading"><div><div className="eyebrow">YOUR SPACE</div><h1>Me</h1><p>Your preferences, progress, and past trades in one place.</p></div></div>{currentPerson ? <section className="profile-card"><PersonAvatar person={currentPerson} index={currentPersonIndex} className="profile-avatar" /><div className="profile-copy"><span>YOUR PROFILE</span><h2>{currentPerson.name}</h2><div className="profile-actions"><label className="profile-upload"><Camera size={16} /> Choose photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => updateProfileImage(event.target.files?.[0] ?? null)} /></label>{currentPerson.profile_image && <button disabled={busy} onClick={() => act({ action: "saveProfileImage", profileImage: null })}>Remove photo</button>}<button onClick={() => setShowPersonPicker(true)}>Switch person</button></div></div></section> : null}<section className="score-card"><div className="score-ring" style={{ background: `conic-gradient(#087cff ${onTimeScore * 3.6}deg,#e5e5eb 0deg)` }}><div><strong>{onTimeScore}%</strong><span>on time</span></div></div><div><span className="section-kicker">ON-TIME SCORE</span><h2>{myCompleted.length ? `${myOnTime} of ${myCompleted.length} chores completed on time` : "Your score starts with your first completed chore"}</h2><p>Finishing by the due date keeps your household moving smoothly.</p></div></section><div className="me-sections"><details className="me-section" open><summary><span><Heart size={18} /> Preferences</span><ChevronDown size={19} /></summary><div className="me-section-copy">Add only the chores you feel strongly about. Strong preferences have the greatest effect on future weeks.</div><div className="preference-toolbar"><button onClick={() => setNewPreference({ choreId: "", strength: 1 })} disabled={busy || !!newPreference}><Plus size={16} /> Add a preference</button></div><div className="preference-list">{newPreference && <div className="preference-row preference-new"><select aria-label="Choose chore" value={newPreference.choreId} onChange={(event) => setNewPreference({ ...newPreference, choreId: Number(event.target.value) })}><option value="">Choose a chore</option>{data.chores.filter((chore) => chore.active && !data.preferences.some((item) => item.person_id === devicePersonId && item.chore_id === chore.id)).map((chore) => <option key={chore.id} value={chore.id}>{chore.title}</option>)}</select><select aria-label="Choose preference strength" value={newPreference.strength} onChange={(event) => setNewPreference({ ...newPreference, strength: Number(event.target.value) })}><option value={-3}>Strongly dislike</option><option value={-2}>Moderately dislike</option><option value={-1}>Slightly dislike</option><option value={1}>Slightly prefer</option><option value={2}>Moderately prefer</option><option value={3}>Strongly prefer</option></select><div className="preference-actions"><button disabled={busy || !newPreference.choreId} onClick={() => { if (newPreference.choreId) { act({ action: "savePreference", choreId: newPreference.choreId, strength: newPreference.strength }); setNewPreference(null); } }}>Save</button><button className="remove" onClick={() => setNewPreference(null)}>Remove</button></div></div>}{data.preferences.filter((item) => item.person_id === devicePersonId && item.strength !== 0).map((preference) => { const chore = data.chores.find((item) => item.id === preference.chore_id && item.active); if (!chore) return null; const strength = preferenceEdits[chore.id] ?? preference.strength; return <div className={`preference-row ${strength > 0 ? `positive strength-${strength}` : `negative strength-${Math.abs(strength)}`}`} key={chore.id}><div className="preference-chore"><strong>{chore.title}</strong><span>{chore.points} pt · {schedule(chore)}</span></div><select aria-label={`${chore.title} preference`} value={strength} disabled={busy} onChange={(event) => setPreferenceEdits({ ...preferenceEdits, [chore.id]: Number(event.target.value) })}><option value={-3}>Strongly dislike</option><option value={-2}>Moderately dislike</option><option value={-1}>Slightly dislike</option><option value={1}>Slightly prefer</option><option value={2}>Moderately prefer</option><option value={3}>Strongly prefer</option></select><div className="preference-actions"><button disabled={busy || strength === preference.strength} onClick={() => act({ action: "savePreference", choreId: chore.id, strength })}>Save</button><button className="remove" disabled={busy} onClick={() => act({ action: "savePreference", choreId: chore.id, strength: 0 })}>Remove</button></div></div>; })}{!newPreference && !data.preferences.some((item) => item.person_id === devicePersonId && item.strength !== 0) && <div className="empty-note preference-empty">No preferences yet. Add one to shape future assignments.</div>}</div></details><details className="me-section"><summary><span><ArrowLeftRight size={18} /> Previous trades</span><ChevronDown size={19} /></summary><div className="personal-trades">{previousTrades.length ? previousTrades.map((trade) => <div className="personal-trade" key={trade.id}><div><strong>{trade.offered_title} <ArrowLeftRight size={13} /> {trade.requested_title}</strong><span>{trade.requester_name} with {trade.recipient_name}</span></div><span className={`trade-status ${trade.status}`}>{trade.status}</span></div>) : <div className="empty-note">Completed and declined trades will appear here.</div>}</div></details><details className="me-section"><summary><span><Sparkles size={18} /> Notifications</span><ChevronDown size={19} /></summary><NotificationSettings personId={devicePersonId ?? null} personName={currentPerson?.name ?? "your person"} /></details></div></div>}
{tab === "manage" && <div className="tab-view"><div className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Manage household</h1><p>Keep the people and chores in your home up to date.</p></div></div><div className="manage-grid"><section className="manage-card"><div className="manage-head"><div><h2>People</h2><p>New people join after Ron approves.</p></div><Button size="sm" onClick={() => setShowPersonPicker(true)}><Plus size={16} /> Request person</Button></div>{activePeople.map((person, index) => <div className="manage-row" key={person.id}><PersonAvatar person={person} index={index} className="small" /><strong>{person.name}</strong>{data.isRonApprover && <button onClick={() => setPersonDraft({ id: person.id, name: person.name })}>Edit</button>}</div>)}{data.isRonApprover ? <div className="approval-section"><h3>Requests to join</h3>{data.pendingRequests.length ? data.pendingRequests.map((request) => <div className="approval-row" key={request.id}><strong>{request.name}</strong><div><Button variant="outline" size="sm" disabled={busy} onClick={() => act({ action: "rejectPerson", id: request.id })}>Decline</Button><Button size="sm" disabled={busy} onClick={() => act({ action: "approvePerson", id: request.id })}>Approve</Button></div></div>) : <p>No one is waiting for approval.</p>}</div> : <div className="approval-section"><p>{data.approvalConfigured ? <>Ron can <a href="/signin-with-chatgpt?return_to=%2F" target="_top">use administrator sign-in</a> to review requests.</> : "Ron approval will be available when the site is configured for him."}</p></div>}</section><section className="manage-card chores-card"><div className="manage-head"><div><h2>Chores & schedules</h2><p>Schedule changes start next week. Existing turns keep their original deadlines.</p></div><Button size="sm" onClick={() => setChoreDraft({ title: "", emoji: "✨", points: 1, frequency: "weekly", days: [1] })}><Plus size={16} /> Add chore</Button></div>{data.chores.filter((chore) => chore.active).map((chore) => <div className="manage-row" key={chore.id}><div className="chore-symbol emoji-symbol">{chore.emoji}</div><div className="manage-task"><strong>{chore.title}</strong><span>{schedule(chore)} · {chore.points} effort point{chore.points === 1 ? "" : "s"}</span></div><button onClick={() => setChoreDraft({ id: chore.id, title: chore.title, emoji: chore.emoji, points: chore.points, frequency: chore.frequency, days: chore.days.split(",").filter(Boolean).map(Number) })}>Edit</button></div>)}</section></div></div>}
        </>}
        {data && tab === "manage" && data.isRonApprover && <section className="manage-card reassignment-card"><div className="manage-head"><div><h2><RefreshCw size={18} /> Reassign chores</h2><p>Ron can rebalance assignments using chore history, workload, and optional preferences.</p></div></div><div className="reassignment-options"><button onClick={() => { setError(""); setAssignmentDraft({ id: null, personId: null, reopen: false, confirming: false, expectedPersonId: null, expectedCompletedAt: null }); }}><strong>Individual chore</strong><span>Choose a person · correct completion</span></button><button onClick={() => setReassignDraft({ action: "reassignUnfinished", title: "Reassign overdue chores?", description: "Only unfinished chores that are already overdue will be redistributed. Preferences remain active." })}><strong>Overdue chores</strong><span>Rebalance only overdue work</span></button><button onClick={() => setReassignDraft({ action: "reassignAll", title: "Reassign all open chores?", description: "Every unfinished chore will be redistributed. Preferences remain active." })}><strong>All open chores</strong><span>Rebalance every unfinished chore</span></button><button onClick={() => setReassignDraft({ action: "reassignEntireWeek", title: "Reassign the entire week?", description: "All chores scheduled this week, including completed chores, will be redistributed using household preferences." })}><strong>Entire week</strong><span>Includes completed · uses preferences</span></button><button onClick={() => setReassignDraft({ action: "reassignEntireWeekEvenly", title: "Reassign without preferences?", description: "All chores scheduled this week, including completed chores, will be redistributed using workload and history only." })}><strong>Entire week evenly</strong><span>Includes completed · ignores preferences</span></button></div>{reassignDraft && <div className="reassignment-confirm" role="alert"><div><strong>{reassignDraft.title}</strong><span>{reassignDraft.description}</span></div><div><Button variant="outline" disabled={busy} onClick={() => setReassignDraft(null)}>Cancel</Button><Button disabled={busy} onClick={() => { act({ action: reassignDraft.action }); setReassignDraft(null); }}>Confirm reassignment</Button></div></div>}</section>}
      </div>
    </main>
    {busy && <div className="saving-indicator" role="status"><LoaderCircle size={17} /> Updating…</div>}
    <Dialog open={!!data && (devicePersonId === null || showPersonPicker)} onOpenChange={(open) => { if (!open && devicePersonId) setShowPersonPicker(false); }}><DialogContent className="editor-dialog person-picker" showCloseButton={!!devicePersonId}><DialogHeader><DialogTitle>{devicePersonId ? "Switch person" : "Who are you?"}</DialogTitle><DialogDescription>Choose your name to see your chores on this device.</DialogDescription></DialogHeader>{error && <div className="error-banner" role="alert">{error}</div>}<div className="picker-list">{activePeople.map((person, index) => <button key={person.id} onClick={() => choosePerson(person.id)}><PersonAvatar person={person} index={index} /><strong>{person.name}</strong><ChevronRight size={17} /></button>)}</div><div className="picker-request"><h3>Not on the list?</h3>{data?.myRequest?.status === "pending" ? <p>Your request for {data.myRequest.name} is waiting for Ron&apos;s approval. This page checks again automatically.</p> : data?.myRequest?.status === "rejected" ? <p>Ron declined the request. You can send a new one.</p> : null}{!data?.approvalConfigured && <p>New-person requests will open when Ron&apos;s approval is set up.</p>}{data?.approvalConfigured && data.myRequest?.status !== "pending" && <form onSubmit={requestPerson}><Input required maxLength={40} placeholder="Your name" aria-label="Your name" value={requestName} onChange={(event) => setRequestName(event.target.value)} /><Button type="submit" disabled={busy || !requestName.trim()}>Request to join</Button></form>}</div></DialogContent></Dialog>
    <Dialog open={!!choreDraft} onOpenChange={(open) => { if (!open) setChoreDraft(null); }}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{choreDraft?.id ? "Edit chore" : "Add a chore"}</DialogTitle><DialogDescription>Choose an emoji, effort, and when it should appear.</DialogDescription></DialogHeader>{choreDraft && <form onSubmit={(event) => { event.preventDefault(); act({ action: "saveChore", ...choreDraft }); }} className="editor-form"><div className="chore-name-fields"><label className="emoji-field">Emoji<Input required maxLength={8} value={choreDraft.emoji} onChange={(event) => setChoreDraft({ ...choreDraft, emoji: event.target.value })} aria-label="Chore emoji" /></label><label>Chore name<Input required value={choreDraft.title} onChange={(event) => setChoreDraft({ ...choreDraft, title: event.target.value })} placeholder="e.g. Clean the bathroom" /></label></div><div className="form-grid"><label>Effort points<select value={choreDraft.points} onChange={(event) => setChoreDraft({ ...choreDraft, points: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((point) => <option key={point} value={point}>{point}</option>)}</select></label><label>Repeats<select value={choreDraft.frequency} onChange={(event) => setChoreDraft({ ...choreDraft, frequency: event.target.value })}><option value="weekly">Every week</option><option value="biweekly">Every other week</option><option value="monthly">Every month</option><option value="bimonthly">Every two months</option><option value="days">On selected days</option></select></label></div>{choreDraft.frequency === "days" && <fieldset><legend>Days of the week</legend><div className="day-buttons">{weekdays.map((day, index) => <button type="button" className={choreDraft.days.includes(index) ? "selected" : ""} key={day} onClick={() => setChoreDraft({ ...choreDraft, days: choreDraft.days.includes(index) ? choreDraft.days.filter((value) => value !== index) : [...choreDraft.days, index] })}>{day}</button>)}</div></fieldset>}<div className="form-actions">{choreDraft.id && <button type="button" className="remove-action" onClick={() => { if (confirm("Remove this chore from future schedules? Open assignments will stay on the board.")) act({ action: "archiveChore", id: choreDraft.id }); }}>Remove chore</button>}<Button disabled={busy} type="submit">Save chore</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!tradeDraft} onOpenChange={(open) => { if (!open) setTradeDraft(null); }}><DialogContent className="editor-dialog trade-dialog"><DialogHeader><DialogTitle>Request a trade</DialogTitle><DialogDescription>Offer your chore for one assigned to someone else. They must accept before anything changes.</DialogDescription></DialogHeader>{tradeDraft && <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (tradeDraft.requestedAssignmentId) act({ action: "requestTrade", ...tradeDraft }); }}><div className="trade-offer"><span>You offer</span><strong>{openAssignments.find((item) => item.id === tradeDraft.offeredAssignmentId)?.title_snapshot}</strong><p className="trade-deadline">Complete by {fullDate(openAssignments.find((item) => item.id === tradeDraft.offeredAssignmentId)!.due_date)}</p></div><label>You want<select required value={tradeDraft.requestedAssignmentId ?? ""} onChange={(event) => setTradeDraft({ ...tradeDraft, requestedAssignmentId: Number(event.target.value) })}><option value="">Choose a chore</option>{tradableAssignments.filter((item) => item.person_id !== devicePersonId && item.chore_id !== openAssignments.find((candidate) => candidate.id === tradeDraft.offeredAssignmentId)?.chore_id).map((item) => <option key={item.id} value={item.id}>{item.title_snapshot} — {item.person_name} · due {fullDate(item.due_date)} ({item.points_snapshot} pt)</option>)}</select></label><p className="trade-selection-note" aria-live="polite">{tradableAssignments.some((item) => item.id === tradeDraft.requestedAssignmentId) ? `Selected deadline: ${fullDate(tradableAssignments.find((item) => item.id === tradeDraft.requestedAssignmentId)!.due_date)}` : "Missed and completed turns are not available for trade."}</p><div className="form-actions"><Button type="button" variant="outline" onClick={() => setTradeDraft(null)}>Cancel</Button><Button type="submit" disabled={busy || !tradableAssignments.some((item) => item.id === tradeDraft.offeredAssignmentId) || !tradableAssignments.some((item) => item.id === tradeDraft.requestedAssignmentId)}>Send request</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!personDraft} onOpenChange={(open) => { if (!open) setPersonDraft(null); }}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>Edit person</DialogTitle><DialogDescription>Ron can update this name or remove a person.</DialogDescription></DialogHeader>{personDraft && <form className="editor-form" onSubmit={(event) => { event.preventDefault(); act({ action: "savePerson", ...personDraft }); }}><label>Name<Input required value={personDraft.name} onChange={(event) => setPersonDraft({ ...personDraft, name: event.target.value })} placeholder="Name" /></label><div className="form-actions">{personDraft.id !== 1 && <button type="button" className="remove-action" onClick={() => { if (confirm("Remove this person and redistribute their unfinished chores?")) act({ action: "archivePerson", id: personDraft.id }); }}>Remove person</button>}<Button disabled={busy} type="submit">Save person</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!assignmentDraft} onOpenChange={(open) => { if (!open && !busy) setAssignmentDraft(null); }}><DialogContent className="editor-dialog assignment-dialog"><DialogHeader><DialogTitle>{assignmentDraft?.confirming ? "Confirm reassignment" : "Reassign a chore"}</DialogTitle><DialogDescription>Ron can correct an individual assignment, including completed chores from past weeks. Its original dates and effort points stay unchanged.</DialogDescription></DialogHeader>{assignmentDraft && <form className="editor-form" onSubmit={(event) => { event.preventDefault(); if (!assignmentDraft.confirming) setAssignmentDraft({ ...assignmentDraft, confirming: true }); else act({ action: "reassignAssignment", id: assignmentDraft.id, personId: assignmentDraft.personId, reopen: assignmentDraft.reopen, expectedPersonId: assignmentDraft.expectedPersonId, expectedCompletedAt: assignmentDraft.expectedCompletedAt }); }}>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <label>Chore assignment<select required disabled={busy || assignmentDraft.confirming} value={assignmentDraft.id ?? ""} onChange={(event) => { const item = data?.assignments.find((assignment) => assignment.id === Number(event.target.value)); setAssignmentDraft({ id: item?.id ?? null, personId: item?.person_id ?? null, reopen: !!item?.completed_at, confirming: false, expectedPersonId: item?.person_id ?? null, expectedCompletedAt: item?.completed_at ?? null }); }}><option value="">Choose a chore</option>{data?.assignments.map((item) => <option key={item.id} value={item.id}>{item.title_snapshot} — {item.person_name} · due {displayDate(item.due_date)} · {item.completed_at ? "completed" : "unfinished"}</option>)}</select></label>
      <label>Assign to<select required disabled={busy || assignmentDraft.confirming} value={assignmentDraft.personId ?? ""} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, personId: Number(event.target.value) || null })}><option value="">Choose a person</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      {assignmentDraft.expectedCompletedAt && <label className="assignment-reopen"><input type="checkbox" checked={assignmentDraft.reopen} disabled={busy || assignmentDraft.confirming} onChange={(event) => setAssignmentDraft({ ...assignmentDraft, reopen: event.target.checked })} /> Reopen as unfinished</label>}
      {assignmentDraft.confirming && <p role="status">This chore will belong to {activePeople.find((person) => person.id === assignmentDraft.personId)?.name}{assignmentDraft.reopen && assignmentDraft.expectedCompletedAt ? " and return to their to-do list" : assignmentDraft.expectedCompletedAt ? " and remain completed" : " and remain unfinished"}. Any pending trade involving it will be cancelled.</p>}
      <div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => assignmentDraft.confirming ? setAssignmentDraft({ ...assignmentDraft, confirming: false }) : setAssignmentDraft(null)}>{assignmentDraft.confirming ? "Back" : "Cancel"}</Button><Button type="submit" disabled={busy || !assignmentDraft.id || !assignmentDraft.personId || (assignmentDraft.personId === assignmentDraft.expectedPersonId && !(assignmentDraft.reopen && assignmentDraft.expectedCompletedAt))}>{busy ? "Saving…" : assignmentDraft.confirming ? "Confirm reassignment" : "Review change"}</Button></div>
    </form>}</DialogContent></Dialog>
    <NotificationOnboarding personId={devicePersonId ?? null} personName={currentPerson?.name ?? "your household"} />
  </div>;
}
