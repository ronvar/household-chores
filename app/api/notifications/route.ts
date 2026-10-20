import { env } from "cloudflare:workers";

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

function validEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (
      url.hostname === "web.push.apple.com" ||
      url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

export async function GET() {
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY && env.REMINDER_WORKER_URL && env.REMINDER_WORKER_SECRET ? env.VAPID_PUBLIC_KEY : null });
}

export async function POST(request: Request) {
  if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.REMINDER_WORKER_URL || !env.REMINDER_WORKER_SECRET) return Response.json({ error: "Notifications are not configured." }, { status: 503 });
  const body = await request.json() as { personId?: number; subscription?: Subscription; timezone?: string };
  const personId = Number(body.personId);
  const subscription = body.subscription;
  const timezone = String(body.timezone ?? "");
  if (!Number.isInteger(personId) || personId < 1 || !subscription || !validEndpoint(subscription.endpoint) || subscription.endpoint.length > 2048 ||
    !/^[A-Za-z0-9_-]{40,256}$/.test(subscription.keys?.p256dh ?? "") || !/^[A-Za-z0-9_-]{16,256}$/.test(subscription.keys?.auth ?? ""))
    return Response.json({ error: "Invalid notification subscription." }, { status: 400 });
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
  catch { return Response.json({ error: "Invalid time zone." }, { status: 400 }); }
  const person = await env.DB.prepare("SELECT id FROM people WHERE id = ? AND active = 1").bind(personId).first();
  if (!person) return Response.json({ error: "Person not found." }, { status: 404 });
  await env.DB.prepare("INSERT INTO push_subscriptions (endpoint, person_id, p256dh, auth, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth, timezone = excluded.timezone")
    .bind(subscription.endpoint, personId, subscription.keys.p256dh, subscription.keys.auth, timezone, new Date().toISOString()).run();
  const upstream = await fetch(`${env.REMINDER_WORKER_URL}/subscription`, { method: "PUT", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ personId, subscription, timezone }) });
  if (!upstream.ok) return Response.json({ error: "Could not activate reminders." }, { status: 502 });
  const assignments = await env.DB.prepare("SELECT id, person_id, due_date FROM assignments WHERE completed_at IS NULL ORDER BY id").all<{ id: number; person_id: number; due_date: string }>();
  await fetch(`${env.REMINDER_WORKER_URL}/snapshot`, { method: "POST", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ assignments: assignments.results.map((assignment) => ({ id: assignment.id, personId: assignment.person_id, dueDate: assignment.due_date })) }) }).catch(console.error);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!env.DB || !env.REMINDER_WORKER_URL || !env.REMINDER_WORKER_SECRET) return Response.json({ error: "Reminders are unavailable." }, { status: 503 });
  const body = await request.json() as { endpoint?: string };
  const endpoint = String(body.endpoint ?? "");
  if (!validEndpoint(endpoint)) return Response.json({ error: "Invalid endpoint." }, { status: 400 });
  const upstream = await fetch(`${env.REMINDER_WORKER_URL}/subscription`, { method: "DELETE", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
  if (!upstream.ok) return Response.json({ error: "Could not turn off reminders." }, { status: 502 });
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
  return Response.json({ ok: true });
}

export async function PUT(request: Request) {
  if (!env.REMINDER_WORKER_URL || !env.REMINDER_WORKER_SECRET) return Response.json({ error: "Reminders are unavailable." }, { status: 503 });
  const body = await request.json() as { endpoint?: string };
  const endpoint = String(body.endpoint ?? "");
  if (!validEndpoint(endpoint)) return Response.json({ error: "Invalid endpoint." }, { status: 400 });
  const upstream = await fetch(`${env.REMINDER_WORKER_URL}/test`, { method: "POST", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
  if (!upstream.ok) return Response.json({ error: "Test delivery failed." }, { status: 502 });
  return Response.json({ ok: true });
}
