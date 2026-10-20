import webpush from "web-push";
import { completionStatus } from "../../lib/chore-schedule";

interface Env {
  DB: D1Database;
  HOUSEHOLD_SITE_URL: string;
  SYNC_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

type Subscription = { endpoint: string; person_id: number; p256dh: string; auth: string; timezone: string; last_sent_date: string | null };
type OpenAssignment = { id: number; personId: number; dueDate: string };
type ReminderAssignment = { person_id: number; scheduled_date: string; due_date: string; available_date?: string | null; completed_at: string | null; repeated: boolean };
type ReminderBoard = { today: string; weekStart: string; assignments: ReminderAssignment[] };

async function deliver(env: Env, subscription: Subscription, body: string, count: number, title = "Household chores", tag = "daily-chores", ttl = 3600) {
  const origin = new URL(env.HOUSEHOLD_SITE_URL).origin;
  const notification = {
    title,
    body,
    navigate: `${origin}/`,
    icon: `${origin}/icon-192.png`,
    tag,
    silent: false,
    app_badge: String(count),
  };
  const details = webpush.generateRequestDetails(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify({ web_push: 8030, notification, title, body, count, tag, url: "/" }),
    { vapidDetails: { subject: origin, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, TTL: ttl, urgency: "high" },
  );
  return fetch(details.endpoint, { method: "POST", headers: details.headers as HeadersInit, body: details.body ? Uint8Array.from(details.body).buffer as ArrayBuffer : undefined });
}

function localTime(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour")) };
}

function validSubscription(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") return false;
  const subscription = value as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return typeof subscription.endpoint === "string" && subscription.endpoint.length < 2048 &&
    /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//.test(subscription.endpoint) &&
    /^[A-Za-z0-9_-]{40,256}$/.test(subscription.keys?.p256dh ?? "") && /^[A-Za-z0-9_-]{16,256}$/.test(subscription.keys?.auth ?? "");
}

async function sendReminders(env: Env) {
  const subscriptions = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY created_at").all<Subscription>();
  const pending = subscriptions.results.filter((subscription) => {
    const { date, hour } = localTime(subscription.timezone);
    const slot = `${date}@${hour}`;
    return [10, 14, 18].includes(hour) && subscription.last_sent_date !== date && subscription.last_sent_date !== slot;
  });
  if (!pending.length) return;
  let board: ReminderBoard;
  try {
    const today = localTime("America/Los_Angeles").date;
    const origin = new URL(env.HOUSEHOLD_SITE_URL).origin;
    const response = await fetch(`${origin}/api/household?today=${today}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Household refresh failed: ${response.status}`);
    const result = await response.json() as ReminderBoard;
    const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (result.today !== today || !validDate(result.weekStart) || !Array.isArray(result.assignments) || result.assignments.some((assignment) => !Number.isInteger(assignment.person_id) || assignment.person_id < 1 || !validDate(assignment.scheduled_date) || !validDate(assignment.due_date) || (assignment.available_date != null && !validDate(assignment.available_date)) || (assignment.completed_at !== null && typeof assignment.completed_at !== "string") || typeof assignment.repeated !== "boolean")) throw new Error("Household refresh returned an invalid board.");
    board = result;
  } catch (error) {
    console.error("Skipping reminders: current chore eligibility could not be verified", error);
    return;
  }
  const eligible = board.assignments.filter((assignment) => assignment.due_date <= board.today && completionStatus(assignment, board.today, board.weekStart) === "available");
  for (const subscription of pending) {
    const { date, hour } = localTime(subscription.timezone);
    const slot = `${date}@${hour}`;
    const assignments = eligible.filter((assignment) => assignment.person_id === subscription.person_id);
    const due = assignments.length;
    if (!due) continue;
    const overdue = assignments.filter((assignment) => assignment.due_date < board.today).length;
    const dueToday = due - overdue;
    if (!dueToday && hour !== 18) continue;
    const claimed = await env.DB.prepare("UPDATE subscriptions SET last_sent_date = ? WHERE endpoint = ? AND last_sent_date IS ?").bind(slot, subscription.endpoint, subscription.last_sent_date).run();
    if (!claimed.meta.changes) continue;
    const release = () => env.DB.prepare("UPDATE subscriptions SET last_sent_date = ? WHERE endpoint = ? AND last_sent_date = ?").bind(subscription.last_sent_date, subscription.endpoint, slot).run();
    try {
      const body = dueToday ? `${dueToday} chore${dueToday === 1 ? " is" : "s are"} due today. Complete your turn before its deadline.${overdue && hour === 18 ? ` You also have ${overdue} overdue chore${overdue === 1 ? "" : "s"}.` : ""}` : `You have ${overdue} overdue chore${overdue === 1 ? "" : "s"} to catch up on.`;
      const response = await deliver(env, subscription, body, due, "Household chores", `daily-chores-${date}-${hour}`, 7200);
      console.log("Daily reminder delivery", { personId: subscription.person_id, date, due, status: response.status });
      if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      else if (!response.ok) {
        await release();
        console.error("Push delivery failed", response.status);
      }
    } catch (error) {
      await release();
      console.error("Push delivery failed", error);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Authorization") !== `Bearer ${env.SYNC_SECRET}` || !env.SYNC_SECRET)
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    const pathname = new URL(request.url).pathname;
    if (pathname === "/subscription" && request.method === "PUT") {
      const body = await request.json() as { personId?: number; subscription?: unknown; timezone?: string };
      const personId = Number(body.personId);
      if (!Number.isInteger(personId) || personId < 1 || !validSubscription(body.subscription)) return Response.json({ error: "Invalid subscription." }, { status: 400 });
      const timezone = String(body.timezone ?? "");
      try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
      catch { return Response.json({ error: "Invalid time zone." }, { status: 400 }); }
      await env.DB.prepare("INSERT INTO subscriptions (endpoint, person_id, p256dh, auth, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth, timezone = excluded.timezone")
        .bind(body.subscription.endpoint, personId, body.subscription.keys.p256dh, body.subscription.keys.auth, timezone, new Date().toISOString()).run();
      return Response.json({ ok: true });
    }
    if (pathname === "/subscription" && request.method === "DELETE") {
      const body = await request.json() as { endpoint?: string };
      if (typeof body.endpoint !== "string") return Response.json({ error: "Invalid endpoint." }, { status: 400 });
      await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
      return Response.json({ ok: true });
    }
    if (pathname === "/test" && request.method === "POST") {
      const body = await request.json() as { endpoint?: string };
      if (typeof body.endpoint !== "string") return Response.json({ error: "Invalid endpoint." }, { status: 400 });
      const subscription = await env.DB.prepare("SELECT * FROM subscriptions WHERE endpoint = ?").bind(body.endpoint).first<Subscription>();
      if (!subscription) return Response.json({ error: "Subscription not found." }, { status: 404 });
      const response = await deliver(env, subscription, "Test reminder: notifications are working on this device.", 0);
      if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      if (!response.ok) return Response.json({ error: "Push service rejected the notification.", status: response.status }, { status: 502 });
      return Response.json({ ok: true });
    }
    if (pathname === "/notify-person" && request.method === "POST") {
      const body = await request.json() as { personId?: number; title?: string; body?: string; count?: number; tag?: string };
      const personId = Number(body.personId);
      const message = String(body.body ?? "").trim();
      const title = String(body.title ?? "Household chores").trim().slice(0, 80);
      const tag = String(body.tag ?? "household-update").trim().slice(0, 80);
      const count = Math.max(0, Math.min(99, Number(body.count) || 0));
      if (!Number.isInteger(personId) || personId < 1 || !message || message.length > 240) return Response.json({ error: "Invalid notification." }, { status: 400 });
      const subscriptions = await env.DB.prepare("SELECT * FROM subscriptions WHERE person_id = ? ORDER BY created_at").bind(personId).all<Subscription>();
      let delivered = 0;
      for (const subscription of subscriptions.results) {
        try {
          const response = await deliver(env, subscription, message, count, title || "Household chores", tag || "household-update");
          if (response.ok) delivered += 1;
          else if (response.status === 404 || response.status === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
          else console.error("Push delivery failed", response.status);
        } catch (error) {
          console.error("Push delivery failed", error);
        }
      }
      return Response.json({ ok: true, delivered, subscriptions: subscriptions.results.length });
    }
    if (pathname === "/snapshot" && request.method === "POST") {
      const body = await request.json() as { assignments?: OpenAssignment[] };
      if (!Array.isArray(body.assignments) || body.assignments.length > 1000 || body.assignments.some((assignment) => !Number.isInteger(assignment.id) || assignment.id < 1 || !Number.isInteger(assignment.personId) || assignment.personId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(assignment.dueDate)))
        return Response.json({ error: "Invalid assignments." }, { status: 400 });
      const existing = await env.DB.prepare("SELECT id, person_id, due_date FROM open_assignments").all<{ id: number; person_id: number; due_date: string }>();
      const incoming = new Map(body.assignments.map((assignment) => [assignment.id, assignment]));
      const current = new Map(existing.results.map((assignment) => [assignment.id, assignment]));
      const changes: D1PreparedStatement[] = [];
      for (const assignment of existing.results) {
        if (!incoming.has(assignment.id)) changes.push(env.DB.prepare("DELETE FROM open_assignments WHERE id = ?").bind(assignment.id));
      }
      for (const assignment of body.assignments) {
        const prior = current.get(assignment.id);
        if (!prior || prior.person_id !== assignment.personId || prior.due_date !== assignment.dueDate) {
          changes.push(env.DB.prepare("INSERT INTO open_assignments (id, person_id, due_date) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET person_id = excluded.person_id, due_date = excluded.due_date").bind(assignment.id, assignment.personId, assignment.dueDate));
        }
      }
      if (changes.length) await env.DB.batch(changes);
      return Response.json({ ok: true, count: body.assignments.length, changed: changes.length });
    }
    return Response.json({ error: "Not found." }, { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await sendReminders(env);
  },
};
