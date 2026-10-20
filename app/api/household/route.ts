import { env } from "cloudflare:workers";
import { getAuthenticatedUser } from "../../auth";
import { canTradeAssignment, completedOnTime, completionStart, completionStatus, selectedDays } from "../../../lib/chore-schedule";

type Person = { id: number; name: string; active: number; profile_image: string | null };
type Chore = { id: number; title: string; emoji: string; points: number; frequency: string; days: string; active: number };
type Assignment = { id: number; chore_id: number; person_id: number; scheduled_date: string; due_date: string; available_date?: string | null; frequency_snapshot?: string | null; days_snapshot?: string | null; completed_at: string | null; title_snapshot: string; points_snapshot: number; person_name?: string; emoji?: string };
type Preference = { person_id: number; chore_id: number; strength: number };
type PersonRequest = { id: number; name: string; status: string; person_id: number | null };
type TradeSignal = { requester_id: number; recipient_id: number; offered_chore_id: number; requested_chore_id: number };

const starterChores: [string, string, number, string, string][] = [
  ["Clean bathroom", "🛁", 3, "weekly", ""], ["Vacuum shared areas", "🧹", 2, "weekly", ""],
  ["Clean stove", "🍳", 2, "weekly", ""], ["Kitchen counters & sink", "🧽", 1, "weekly", ""],
  ["Sweep patio & walkway", "🧹", 2, "weekly", ""], ["Clear leaves & debris", "🍂", 1, "weekly", ""],
  ["Outdoor trash & recycling", "♻️", 1, "weekly", ""], ["Mop floors", "🪣", 2, "biweekly", ""],
  ["Pull weeds & light trimming", "🌿", 2, "biweekly", ""], ["Check dead plants", "🥀", 1, "biweekly", ""],
  ["Water plants", "🪴", 1, "days", "1,3,5"], ["Pick up dog poop", "🐕", 1, "days", "1,3,5"],
  ["Indoor trash & recycling", "🗑️", 1, "weekly", ""],
];

function db() {
  if (!env.DB) throw new Error("The household database is unavailable.");
  return env.DB as D1Database;
}

async function ronCanApprove() {
  const configuredEmail = env.RON_APPROVER_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;
  const user = await getAuthenticatedUser();
  return !!user && user.email.toLowerCase() === configuredEmail;
}

function event(database: D1Database, actorName: string, message: string) {
  return database.prepare("INSERT INTO board_events (actor_name, message, created_at) VALUES (?, ?, ?)").bind(actorName, message, new Date().toISOString());
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function syncReminders(assignments: (Assignment & { frequency?: string })[]) {
  if (!env.REMINDER_WORKER_URL || !env.REMINDER_WORKER_SECRET) return;
  const open = assignments.filter((assignment) => !assignment.completed_at && !((assignment.frequency_snapshot ?? assignment.frequency) === "days" && assignment.due_date < householdCalendar().today)).map((assignment) => ({ id: assignment.id, personId: assignment.person_id, dueDate: assignment.due_date }));
  const response = await fetch(`${env.REMINDER_WORKER_URL}/snapshot`, { method: "POST", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ assignments: open }) });
  if (!response.ok) throw new Error(`Reminder sync failed: ${response.status}`);
}

async function notifyPerson(personId: number, title: string, body: string, count = 1, tag = "household-update") {
  if (!env.REMINDER_WORKER_URL || !env.REMINDER_WORKER_SECRET) return;
  const response = await fetch(`${env.REMINDER_WORKER_URL}/notify-person`, { method: "POST", headers: { Authorization: `Bearer ${env.REMINDER_WORKER_SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ personId, title, body, count, tag }) });
  if (!response.ok) throw new Error(`Notification delivery failed: ${response.status}`);
}

function scheduleLabel(frequency: string, days: string) {
  if (frequency === "weekly") return "weekly";
  if (frequency === "biweekly") return "every other week";
  if (frequency === "monthly") return "monthly";
  if (frequency === "bimonthly") return "every two months";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.split(",").map((day) => names[Number(day)]).join(", ");
}

function preferenceLabel(strength: number) {
  return ({ "-3": "strongly dislikes", "-2": "moderately dislikes", "-1": "slightly dislikes", "0": "is neutral about", "1": "slightly prefers", "2": "moderately prefers", "3": "strongly prefers" } as Record<string, string>)[String(strength)];
}

function dateAdd(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monday(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dateAdd(date, -((weekday + 6) % 7));
}

function householdCalendar(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const start = monday(today);
  return { today, weekStart: today === start && Number(part("hour")) < 9 ? dateAdd(start, -7) : start };
}

function validDate(date: string | null) {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
}

function preferenceMap(preferences: Preference[]) {
  return new Map(preferences.map((item) => [`${item.person_id}:${item.chore_id}`, item.strength]));
}

function tradeAffinityMap(signals: TradeSignal[]) {
  const affinity = new Map<string, number>();
  const add = (personId: number, choreId: number, value: number) => {
    const key = `${personId}:${choreId}`;
    affinity.set(key, Math.max(-3, Math.min(3, (affinity.get(key) ?? 0) + value)));
  };
  for (const signal of signals) {
    add(signal.requester_id, signal.requested_chore_id, -0.75);
    add(signal.requester_id, signal.offered_chore_id, 0.75);
    add(signal.recipient_id, signal.offered_chore_id, -0.75);
    add(signal.recipient_id, signal.requested_chore_id, 0.75);
  }
  return affinity;
}

function chooseAssignee(people: Person[], choreId: number, points: number, weeklyLoad: Map<number, number>, targetLoad: number, recentOwners: number[], preferences: Map<string, number>, tradeAffinity: Map<string, number>) {
  const preferenceCost: Record<number, number> = { [-3]: 5, [-2]: 2.5, [-1]: 1, 0: 0, 1: -3.5, 2: -8, 3: -15 };
  const cost = (person: Person) => {
    const preference = preferences.get(`${person.id}:${choreId}`) ?? 0;
    const projectedLoad = (weeklyLoad.get(person.id) ?? 0) + points;
    const overload = Math.max(0, projectedLoad - targetLoad);
    const repeatWeight = preference === 3 ? 0.25 : preference > 0 ? 0.5 : preference < 0 ? 1.2 : 1;
    const repeatCost = recentOwners.reduce((total, owner, index) => owner === person.id ? total + [4, 2, 1, 0.5][index] * repeatWeight : total, 0);
    return projectedLoad * 6 + overload * overload * 5 + preferenceCost[preference] + repeatCost + (tradeAffinity.get(`${person.id}:${choreId}`) ?? 0);
  };
  return [...people].sort((left, right) => {
    return cost(left) - cost(right) || (weeklyLoad.get(left.id) ?? 0) - (weeklyLoad.get(right.id) ?? 0) || left.id - right.id;
  })[0];
}

async function initialize(database: D1Database) {
  const record = await database.prepare("SELECT id FROM household WHERE id = 1").first();
  if (record) return;
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO household (id, created_at) VALUES (1, ?)").bind(new Date().toISOString()),
    database.prepare("INSERT OR IGNORE INTO people (id, name, active) VALUES (1, 'Ron', 1)"),
    database.prepare("INSERT OR IGNORE INTO people (id, name, active) VALUES (2, 'jasgross', 1)"),
    database.prepare("INSERT OR IGNORE INTO people (id, name, active) VALUES (3, 'wiyup', 1)"),
    ...starterChores.map(([title, emoji, points, frequency, days], index) => database.prepare("INSERT OR IGNORE INTO chores (id, title, emoji, points, frequency, days, active) VALUES (?, ?, ?, ?, ?, ?, 1)").bind(index + 1, title, emoji, points, frequency, days)),
  ]);
}

async function generate(database: D1Database, start: string): Promise<number> {
  const end = dateAdd(start, 6);
  const [peopleResult, choresResult, assignmentsResult, preferencesResult, tradesResult] = await database.batch([
    database.prepare("SELECT * FROM people WHERE active = 1 ORDER BY id"),
    database.prepare("SELECT * FROM chores WHERE active = 1 ORDER BY id"),
    database.prepare("SELECT * FROM assignments WHERE superseded_by_assignment_id IS NULL ORDER BY scheduled_date DESC, id DESC"),
    database.prepare("SELECT person_id, chore_id, strength FROM chore_preferences"),
    database.prepare("SELECT t.requester_id, t.recipient_id, offered.chore_id AS offered_chore_id, requested.chore_id AS requested_chore_id FROM trade_requests t JOIN assignments offered ON offered.id = t.offered_assignment_id JOIN assignments requested ON requested.id = t.requested_assignment_id WHERE t.status = 'accepted' ORDER BY t.responded_at DESC LIMIT 100"),
  ]);
  const people = peopleResult.results as Person[];
  const chores = choresResult.results as Chore[];
  let assignments = assignmentsResult.results as Assignment[];
  if (!people.length) return 0;

  const carriedChores = new Set<number>();
  const retirementStatements: D1PreparedStatement[] = [];
  for (const chore of chores.filter((item) => item.frequency === "weekly")) {
    const previous = assignments.filter((item) => item.chore_id === chore.id && (item.frequency_snapshot ?? chore.frequency) === "weekly" && item.scheduled_date < start).sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date) || left.id - right.id);
    const carried = previous.find((item) => !item.completed_at) ?? previous.findLast((item) => item.completed_at && householdCalendar(new Date(item.completed_at)).weekStart === start);
    if (!carried) continue;
    carriedChores.add(chore.id);
    for (const duplicate of assignments.filter((item) => item.chore_id === chore.id && !item.completed_at && item.id !== carried.id && item.scheduled_date >= carried.scheduled_date && item.scheduled_date <= end)) {
      retirementStatements.push(database.prepare("UPDATE assignments SET superseded_by_assignment_id = ? WHERE id = ? AND completed_at IS NULL AND superseded_by_assignment_id IS NULL").bind(carried.id, duplicate.id));
      retirementStatements.push(database.prepare("INSERT INTO board_events (actor_name, message, created_at) SELECT 'Household', ?, ? WHERE changes() > 0").bind(`Household removed a duplicate ${duplicate.title_snapshot} assignment; kept the original turn due ${carried.due_date}`, new Date().toISOString()));
      retirementStatements.push(database.prepare("UPDATE trade_requests SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND (offered_assignment_id = ? OR requested_assignment_id = ?) AND EXISTS (SELECT 1 FROM assignments WHERE id = ? AND superseded_by_assignment_id = ?)").bind(new Date().toISOString(), duplicate.id, duplicate.id, duplicate.id, carried.id));
    }
  }
  let retired = 0;
  if (retirementStatements.length) {
    const results = await database.batch(retirementStatements);
    retired = results.reduce((count, result, index) => count + (index % 3 === 0 ? result.meta.changes ?? 0 : 0), 0);
    assignments = (await database.prepare("SELECT * FROM assignments WHERE superseded_by_assignment_id IS NULL ORDER BY scheduled_date DESC, id DESC").all<Assignment>()).results;
  }

  const preferences = preferenceMap(preferencesResult.results as Preference[]);
  const tradeAffinity = tradeAffinityMap(tradesResult.results as TradeSignal[]);
  const existingThisWeek = new Set(assignments.filter((item) => item.scheduled_date >= start && item.scheduled_date <= end).map((item) => item.chore_id));
  const weeklyLoad = new Map(people.map((person) => [person.id, 0]));
  for (const item of assignments) {
    if (!weeklyLoad.has(item.person_id)) continue;
    if (item.scheduled_date >= start && item.scheduled_date <= end) weeklyLoad.set(item.person_id, (weeklyLoad.get(item.person_id) ?? 0) + item.points_snapshot);
  }
  const pending: { chore: Chore; scheduled: string; due: string }[] = [];
  const weeksSinceAnchor = Math.floor((Date.parse(`${start}T12:00:00Z`) - Date.parse("2026-09-14T12:00:00Z")) / 604800000);
  for (const chore of chores) {
    if (existingThisWeek.has(chore.id) || carriedChores.has(chore.id)) continue;
    if (chore.frequency === "biweekly" && Math.abs(weeksSinceAnchor % 2) !== 0) continue;
    const monthStart = `${start.slice(0, 8)}01`;
    const followingMonth = new Date(`${monthStart}T12:00:00Z`);
    followingMonth.setUTCMonth(followingMonth.getUTCMonth() + 1);
    const monthlyDate = monthStart >= start ? monthStart : followingMonth.toISOString().slice(0, 10);
    const monthlyValue = new Date(`${monthlyDate}T12:00:00Z`);
    const monthIndex = monthlyValue.getUTCFullYear() * 12 + monthlyValue.getUTCMonth();
    if ((chore.frequency === "monthly" || chore.frequency === "bimonthly") && monthlyDate > end) continue;
    if (chore.frequency === "bimonthly" && monthIndex % 2 !== 0) continue;
    if (chore.frequency === "days") {
      for (const day of selectedDays(chore.days)) {
        const scheduled = dateAdd(start, (day + 6) % 7);
        pending.push({ chore, scheduled, due: scheduled });
      }
    } else if (chore.frequency === "monthly" || chore.frequency === "bimonthly") {
      pending.push({ chore, scheduled: monthlyDate, due: monthlyDate });
    } else pending.push({ chore, scheduled: start, due: end });
  }
  pending.sort((left, right) => right.chore.points - left.chore.points || left.scheduled.localeCompare(right.scheduled));
  const targetLoad = ([...weeklyLoad.values()].reduce((total, points) => total + points, 0) + pending.reduce((total, item) => total + item.chore.points, 0)) / people.length;
  const missedOwners = new Map<string, Person>();
  for (const item of pending.filter((candidate) => candidate.chore.frequency === "days")) {
    const missed = assignments.find((assignment) => assignment.chore_id === item.chore.id && (assignment.frequency_snapshot ?? item.chore.frequency) === "days" && assignment.due_date === dateAdd(item.due, -7) && (!assignment.completed_at || !completedOnTime(assignment)));
    const owner = missed && people.find((person) => person.id === missed.person_id);
    if (!owner) continue;
    missedOwners.set(`${item.chore.id}:${item.scheduled}`, owner);
    weeklyLoad.set(owner.id, (weeklyLoad.get(owner.id) ?? 0) + item.chore.points);
  }
  const statements: D1PreparedStatement[] = [];
  for (const item of pending) {
    const recentOwners = assignments.filter((assignment) => assignment.chore_id === item.chore.id).slice(0, 4).map((assignment) => assignment.person_id);
    const missedOwner = missedOwners.get(`${item.chore.id}:${item.scheduled}`);
    const selected = missedOwner ?? chooseAssignee(people, item.chore.id, item.chore.points, weeklyLoad, targetLoad, recentOwners, preferences, tradeAffinity);
    if (!missedOwner) weeklyLoad.set(selected.id, (weeklyLoad.get(selected.id) ?? 0) + item.chore.points);
    const previousDue = assignments.filter((assignment) => assignment.chore_id === item.chore.id && assignment.due_date < item.due).map((assignment) => assignment.due_date).sort().at(-1);
    const configuredStart = item.chore.frequency === "days" ? completionStart(item.due, item.chore.days) : item.scheduled;
    const availableDate = item.chore.frequency === "days" && previousDue ? [configuredStart, dateAdd(previousDue, 1)].sort().at(-1)! : configuredStart;
    assignments.unshift({ id: 0, chore_id: item.chore.id, person_id: selected.id, scheduled_date: item.scheduled, due_date: item.due, available_date: availableDate, frequency_snapshot: item.chore.frequency, days_snapshot: item.chore.days, completed_at: null, title_snapshot: item.chore.title, points_snapshot: item.chore.points });
    statements.push(database.prepare("INSERT OR IGNORE INTO assignments (chore_id, person_id, scheduled_date, due_date, available_date, frequency_snapshot, days_snapshot, title_snapshot, points_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.chore.id, selected.id, item.scheduled, item.due, availableDate, item.chore.frequency, item.chore.days, item.chore.title, item.chore.points));
  }
  let created = 0;
  if (statements.length) {
    const results = await database.batch(statements);
    created = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
    if (created) await event(database, "Household", `Household assigned ${created} chores for the week of ${start}`).run();
  }
  return created + retired;
}

function assignmentWindows(assignments: Assignment[], chores: Chore[]) {
  return assignments.map((assignment) => {
    const chore = chores.find((candidate) => candidate.id === assignment.chore_id);
    const frequency = assignment.frequency_snapshot ?? chore?.frequency;
    const days = assignment.days_snapshot ?? chore?.days ?? "";
    const repeated = frequency === "days" && assignment.scheduled_date === assignment.due_date;
    const previousDue = assignments.filter((candidate) => candidate.chore_id === assignment.chore_id && candidate.due_date < assignment.due_date).map((candidate) => candidate.due_date).sort().at(-1);
    const configuredStart = repeated ? completionStart(assignment.due_date, days) : assignment.scheduled_date;
    const availableDate = assignment.available_date ?? (repeated && previousDue ? [configuredStart, dateAdd(previousDue, 1)].sort().at(-1)! : configuredStart);
    const earlierSchedule = !!chore && (assignment.frequency_snapshot ? assignment.frequency_snapshot !== chore.frequency || (frequency === "days" && selectedDays(days).join(",") !== selectedDays(chore.days).join(",")) : chore.frequency === "days" && !selectedDays(chore.days).includes(new Date(`${assignment.due_date}T12:00:00Z`).getUTCDay()));
    return { ...assignment, available_date: availableDate, repeated, earlier_schedule: earlierSchedule };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const today = url.searchParams.get("today");
    if (!validDate(today) || Math.abs(Date.parse(`${today}T12:00:00Z`) - Date.now()) > 172800000) return bad("A valid local date is required.");
    const database = db();
    await initialize(database);
    const { weekStart } = householdCalendar();
    const generated = await generate(database, weekStart);
    const isRonApprover = await ronCanApprove();
    const requestId = Number(url.searchParams.get("requestId"));
    const [people, chores, assignments, events, pending, preferences, trades] = await database.batch([
      database.prepare("SELECT * FROM people ORDER BY active DESC, id"),
      database.prepare("SELECT * FROM chores ORDER BY active DESC, id"),
database.prepare("SELECT a.*, p.name AS person_name, c.emoji, c.frequency FROM assignments a JOIN people p ON p.id = a.person_id JOIN chores c ON c.id = a.chore_id WHERE a.superseded_by_assignment_id IS NULL ORDER BY a.scheduled_date DESC, a.id DESC"),
      database.prepare("SELECT * FROM board_events ORDER BY created_at DESC, id DESC LIMIT 200"),
      database.prepare(isRonApprover ? "SELECT * FROM person_requests WHERE status = 'pending' ORDER BY created_at, id" : "SELECT * FROM person_requests WHERE 1 = 0"),
      database.prepare("SELECT person_id, chore_id, strength, updated_at FROM chore_preferences"),
      database.prepare("SELECT t.*, requester.name AS requester_name, recipient.name AS recipient_name, offered.title_snapshot AS offered_title, requested.title_snapshot AS requested_title FROM trade_requests t JOIN people requester ON requester.id = t.requester_id JOIN people recipient ON recipient.id = t.recipient_id JOIN assignments offered ON offered.id = t.offered_assignment_id JOIN assignments requested ON requested.id = t.requested_assignment_id ORDER BY t.created_at DESC LIMIT 100"),
    ]);
    const myRequest = Number.isInteger(requestId) && requestId > 0 ? await database.prepare("SELECT id, name, status, person_id FROM person_requests WHERE id = ?").bind(requestId).first<PersonRequest>() : null;
    if (generated) await syncReminders(assignments.results as Assignment[]).catch(console.error);
    return Response.json({ today, weekStart, people: people.results, chores: chores.results, assignments: assignmentWindows(assignments.results as Assignment[], chores.results as Chore[]), events: events.results, pendingRequests: pending.results, preferences: preferences.results, trades: trades.results, myRequest, isRonApprover, approvalConfigured: !!env.RON_APPROVER_EMAIL });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Household data could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const database = db();
    const id = Number(body.id);
    if (body.action === "requestPerson") {
      if (!env.RON_APPROVER_EMAIL) return bad("Ron approval is not set up yet.", 503);
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return bad("Enter your name.");
      const duplicate = await database.prepare("SELECT id FROM people WHERE active = 1 AND lower(name) = lower(?)").bind(name).first();
      if (duplicate) return bad("That name is already part of this household.");
      const pending = await database.prepare("SELECT id FROM person_requests WHERE status = 'pending' AND lower(name) = lower(?)").bind(name).first<{ id: number }>();
      if (pending) return Response.json({ ok: true, requestId: pending.id });
      const result = await database.prepare("INSERT INTO person_requests (name, status, created_at) VALUES (?, 'pending', ?)").bind(name, new Date().toISOString()).run();
      return Response.json({ ok: true, requestId: result.meta.last_row_id });
    }

    const isRonApprover = await ronCanApprove();
    if (body.action === "approvePerson" || body.action === "rejectPerson") {
      if (!isRonApprover) return bad("Only Ron can review requests. Sign in with Ron's administrator account.", 403);
      if (!Number.isInteger(id) || id < 1) return bad("Invalid request.");
      const pending = await database.prepare("SELECT id, name, status FROM person_requests WHERE id = ?").bind(id).first<{ id: number; name: string; status: string }>();
      if (!pending || pending.status !== "pending") return bad("This request has already been reviewed.", 409);
      if (body.action === "rejectPerson") {
        await database.batch([database.prepare("UPDATE person_requests SET status = 'rejected', decided_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), id), event(database, "Ron", `Ron declined ${pending.name}'s request to join`)]);
        return Response.json({ ok: true });
      }
      const duplicate = await database.prepare("SELECT id FROM people WHERE active = 1 AND lower(name) = lower(?)").bind(pending.name).first();
      if (duplicate) return bad("That name is already part of this household.", 409);
      const inserted = await database.prepare("INSERT INTO people (name, active) VALUES (?, 1)").bind(pending.name).run();
      const personId = Number(inserted.meta.last_row_id);
      await database.prepare("UPDATE person_requests SET status = 'approved', person_id = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(personId, new Date().toISOString(), id).run();
      await redistribute(database, `${pending.name} joined`);
      await event(database, "Ron", `Ron approved ${pending.name} to join the household`).run();
      const reminderAssignments = await database.prepare("SELECT a.*, c.frequency FROM assignments a JOIN chores c ON c.id = a.chore_id WHERE a.superseded_by_assignment_id IS NULL ORDER BY a.id").all<Assignment>();
      await syncReminders(reminderAssignments.results).catch(console.error);
      return Response.json({ ok: true });
    }

    const actorId = Number(body.actorPersonId);
    const actor = Number.isInteger(actorId) && actorId > 0 ? await database.prepare("SELECT id, name, active FROM people WHERE id = ?").bind(actorId).first<Person>() : null;
    if (!actor || !actor.active) return bad("Choose your person before making a change.", 403);

    if (body.action === "reassignAssignment") {
      if (!isRonApprover || actor.id !== 1) return bad("Only Ron can reassign individual chores.", 403);
      const personId = Number(body.personId);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(personId) || personId < 1 || typeof body.reopen !== "boolean") return bad("Choose a chore and an active person.");
      const assignment = await database.prepare("SELECT a.title_snapshot, a.person_id, a.completed_at, a.due_date, p.name AS person_name FROM assignments a JOIN people p ON p.id = a.person_id WHERE a.id = ? AND a.superseded_by_assignment_id IS NULL").bind(id).first<{ title_snapshot: string; person_id: number; completed_at: string | null; due_date: string; person_name: string }>();
      if (!assignment) return bad("Chore not found.", 404);
      if (body.expectedPersonId !== assignment.person_id || body.expectedCompletedAt !== assignment.completed_at) return bad("This chore changed while you were editing it. Close and reopen this form.", 409);
      const person = await database.prepare("SELECT id, name FROM people WHERE id = ? AND active = 1").bind(personId).first<Person>();
      if (!person) return bad("Choose an active person.");
      const completedAt = body.reopen ? null : assignment.completed_at;
      if (personId === assignment.person_id && completedAt === assignment.completed_at) return Response.json({ ok: true });
      const update = await database.prepare("UPDATE assignments SET person_id = ?, completed_at = ?, completed_by_person_id = CASE WHEN ? IS NULL THEN NULL ELSE completed_by_person_id END, completed_by_name = CASE WHEN ? IS NULL THEN NULL ELSE completed_by_name END WHERE id = ? AND superseded_by_assignment_id IS NULL AND person_id = ? AND completed_at IS ? AND EXISTS (SELECT 1 FROM people WHERE id = ? AND active = 1)").bind(personId, completedAt, completedAt, completedAt, id, assignment.person_id, assignment.completed_at, personId).run();
      if (!update.meta.changes) return bad("This chore changed while you were editing it. Close and reopen this form.", 409);
      const reopened = !!assignment.completed_at && completedAt === null;
      await database.batch([
        event(database, "Ron", `Ron ${reopened ? "reopened and " : ""}reassigned ${assignment.title_snapshot} (due ${assignment.due_date}): ${assignment.person_name} → ${person.name}`),
        database.prepare("UPDATE trade_requests SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND (offered_assignment_id = ? OR requested_assignment_id = ?)").bind(new Date().toISOString(), id, id),
      ]);
    } else if (body.action === "complete" || body.action === "undo") {
      if (!Number.isInteger(id) || id < 1) return bad("Invalid chore.");
      const assignment = await database.prepare("SELECT a.*, c.frequency, c.days FROM assignments a JOIN chores c ON c.id = a.chore_id WHERE a.id = ? AND a.superseded_by_assignment_id IS NULL").bind(id).first<Assignment & { frequency: string; days: string }>();
      if (!assignment) return bad("Chore not found.", 404);
      if (assignment.person_id !== actor.id) return bad("Only the assigned person can update this chore.", 403);
      if (!!assignment.completed_at === (body.action === "complete")) return Response.json({ ok: true });
      if (body.action === "complete") {
        const previous = await database.prepare("SELECT MAX(due_date) AS due_date FROM assignments WHERE superseded_by_assignment_id IS NULL AND chore_id = ? AND due_date < ?").bind(assignment.chore_id, assignment.due_date).first<{ due_date: string | null }>();
        const window = assignmentWindows(previous?.due_date ? [assignment, { ...assignment, id: -1, due_date: previous.due_date }] : [assignment], [{ id: assignment.chore_id, frequency: assignment.frequency, days: assignment.days } as Chore])[0];
        const { today, weekStart } = householdCalendar();
        const status = completionStatus(window, today, weekStart);
        if (status === "early") return bad(`Not your turn yet. This chore opens on ${window.available_date}.`, 409);
        if (status === "missed") return bad("Missed the deadline. This week's closed turns cannot be marked complete.", 409);
      }
      await database.batch([database.prepare("UPDATE assignments SET completed_at = ?, completed_by_person_id = ?, completed_by_name = ? WHERE id = ?").bind(body.action === "complete" ? new Date().toISOString() : null, body.action === "complete" ? actor.id : null, body.action === "complete" ? actor.name : null, id), event(database, actor.name, `${actor.name} ${body.action === "complete" ? "completed" : "reopened"} ${assignment.title_snapshot}`)]);
    } else if (body.action === "saveProfileImage") {
      const profileImage = body.profileImage === null ? null : String(body.profileImage ?? "");
      if (profileImage !== null && (!/^data:image\/(jpeg|png|webp);base64,/.test(profileImage) || profileImage.length > 700000)) return bad("Choose a JPG, PNG, or WebP image under 5 MB.");
      await database.batch([
        database.prepare("UPDATE people SET profile_image = ? WHERE id = ?").bind(profileImage, actor.id),
        event(database, actor.name, `${actor.name} ${profileImage ? "updated" : "removed"} their profile picture`),
      ]);
    } else if (body.action === "savePreference") {
      const choreId = Number(body.choreId);
      const strength = Number(body.strength);
      if (!Number.isInteger(choreId) || !Number.isInteger(strength) || strength < -3 || strength > 3) return bad("Choose a valid chore preference.");
      const chore = await database.prepare("SELECT title FROM chores WHERE id = ? AND active = 1").bind(choreId).first<{ title: string }>();
      if (!chore) return bad("Chore not found.", 404);
      const prior = await database.prepare("SELECT strength FROM chore_preferences WHERE person_id = ? AND chore_id = ?").bind(actor.id, choreId).first<{ strength: number }>();
      if ((prior?.strength ?? 0) === strength) return Response.json({ ok: true });
      if (strength === 0) await database.prepare("DELETE FROM chore_preferences WHERE person_id = ? AND chore_id = ?").bind(actor.id, choreId).run();
      else await database.prepare("INSERT INTO chore_preferences (person_id, chore_id, strength, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(person_id, chore_id) DO UPDATE SET strength = excluded.strength, updated_at = excluded.updated_at").bind(actor.id, choreId, strength, new Date().toISOString()).run();
      await event(database, actor.name, `${actor.name} ${preferenceLabel(strength)} ${chore.title}`).run();
    } else if (body.action === "requestTrade") {
      const offeredId = Number(body.offeredAssignmentId);
      const requestedId = Number(body.requestedAssignmentId);
      if (!Number.isInteger(offeredId) || !Number.isInteger(requestedId) || offeredId === requestedId) return bad("Choose two different chores to trade.");
      const [offered, requested] = await Promise.all([
        database.prepare("SELECT a.*, p.name AS person_name, c.frequency FROM assignments a JOIN people p ON p.id = a.person_id JOIN chores c ON c.id = a.chore_id WHERE a.id = ? AND a.superseded_by_assignment_id IS NULL").bind(offeredId).first<Assignment & { frequency: string }>(),
        database.prepare("SELECT a.*, p.name AS person_name, c.frequency FROM assignments a JOIN people p ON p.id = a.person_id JOIN chores c ON c.id = a.chore_id WHERE a.id = ? AND a.superseded_by_assignment_id IS NULL").bind(requestedId).first<Assignment & { frequency: string }>(),
      ]);
      if (!offered || !requested || offered.completed_at || requested.completed_at) return bad("Both chores must still be open.", 409);
      if (offered.person_id !== actor.id) return bad("You can only offer one of your own chores.", 403);
      if (requested.person_id === actor.id) return bad("Choose a chore assigned to someone else.");
      if (offered.chore_id === requested.chore_id) return bad("Choose two different chores to trade.");
      const { today, weekStart } = householdCalendar();
      if (!canTradeAssignment(offered, today, weekStart) || !canTradeAssignment(requested, today, weekStart)) return bad("A chore in this trade has missed its completion window. Choose an active or upcoming turn instead.", 409);
      const conflict = await database.prepare("SELECT id FROM trade_requests WHERE status = 'pending' AND (offered_assignment_id IN (?, ?) OR requested_assignment_id IN (?, ?))").bind(offeredId, requestedId, offeredId, requestedId).first();
      if (conflict) return bad("One of these chores is already part of a pending trade.", 409);
      await database.batch([
        database.prepare("INSERT INTO trade_requests (requester_id, recipient_id, offered_assignment_id, requested_assignment_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").bind(actor.id, requested.person_id, offeredId, requestedId, new Date().toISOString()),
        event(database, actor.name, `${actor.name} offered ${offered.title_snapshot} to ${requested.person_name} for ${requested.title_snapshot}`),
      ]);
      await notifyPerson(requested.person_id, "New chore trade", `${actor.name} wants to trade ${offered.title_snapshot} for ${requested.title_snapshot}.`, 1, `trade-${actor.id}-${requested.person_id}`).catch(console.error);
    } else if (["acceptTrade", "declineTrade", "cancelTrade"].includes(String(body.action))) {
      const trade = await database.prepare("SELECT t.*, requester.name AS requester_name, recipient.name AS recipient_name, offered.title_snapshot AS offered_title, offered.person_id AS offered_owner, offered.completed_at AS offered_completed, requested.title_snapshot AS requested_title, requested.person_id AS requested_owner, requested.completed_at AS requested_completed FROM trade_requests t JOIN people requester ON requester.id = t.requester_id JOIN people recipient ON recipient.id = t.recipient_id JOIN assignments offered ON offered.id = t.offered_assignment_id JOIN assignments requested ON requested.id = t.requested_assignment_id WHERE t.id = ? AND offered.superseded_by_assignment_id IS NULL AND requested.superseded_by_assignment_id IS NULL").bind(id).first<Record<string, string | number | null>>();
      if (!trade || trade.status !== "pending") return bad("This trade is no longer pending.", 409);
      if (body.action === "cancelTrade") {
        if (trade.requester_id !== actor.id) return bad("Only the sender can cancel this trade.", 403);
        await database.batch([database.prepare("UPDATE trade_requests SET status = 'cancelled', responded_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), id), event(database, actor.name, `${actor.name} cancelled the trade request`)]);
      } else {
        if (trade.recipient_id !== actor.id) return bad("Only the recipient can answer this trade.", 403);
        if (body.action === "declineTrade") {
          await database.batch([database.prepare("UPDATE trade_requests SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), id), event(database, actor.name, `${actor.name} declined ${trade.requester_name}'s trade request`)]);
        } else {
          if (trade.offered_completed || trade.requested_completed || trade.offered_owner !== trade.requester_id || trade.requested_owner !== trade.recipient_id) {
            await database.prepare("UPDATE trade_requests SET status = 'cancelled', responded_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), id).run();
            return bad("The assignments changed, so this trade can no longer be accepted.", 409);
          }
          const assignments = await Promise.all([trade.offered_assignment_id, trade.requested_assignment_id].map((assignmentId) => database.prepare("SELECT a.*, c.frequency FROM assignments a JOIN chores c ON c.id = a.chore_id WHERE a.id = ? AND a.superseded_by_assignment_id IS NULL").bind(assignmentId).first<Assignment & { frequency: string }>()));
          const { today, weekStart } = householdCalendar();
          if (assignments.some((assignment) => !assignment || !canTradeAssignment(assignment, today, weekStart))) return bad("A chore in this trade has missed its completion window. Cancel this request and choose an active or upcoming turn instead.", 409);
          await database.batch([
            database.prepare("UPDATE assignments SET person_id = ? WHERE id = ? AND superseded_by_assignment_id IS NULL AND completed_at IS NULL AND person_id = ?").bind(trade.recipient_id, trade.offered_assignment_id, trade.requester_id),
            database.prepare("UPDATE assignments SET person_id = ? WHERE id = ? AND superseded_by_assignment_id IS NULL AND completed_at IS NULL AND person_id = ?").bind(trade.requester_id, trade.requested_assignment_id, trade.recipient_id),
            database.prepare("UPDATE trade_requests SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'pending'").bind(new Date().toISOString(), id),
            event(database, actor.name, `${actor.name} accepted ${trade.requester_name}'s trade: ${trade.offered_title} for ${trade.requested_title}`),
          ]);
        }
      }
    } else if (["reassignUnfinished", "reassignAll", "reassignEntireWeek", "reassignEntireWeekEvenly"].includes(String(body.action))) {
      if (!isRonApprover || actor.id !== 1) return bad("Only Ron can force a reassignment.", 403);
      if (body.action === "reassignUnfinished") await redistribute(database, "Ron requested an overdue-chore rebalance", { overdueOnly: true });
      else if (body.action === "reassignAll") await redistribute(database, "Ron requested a full open-chore rebalance");
      else await redistribute(database, body.action === "reassignEntireWeekEvenly" ? "Ron requested a full-week rebalance without preferences" : "Ron requested a full-week rebalance", { includeCompleted: true, ignorePreferences: body.action === "reassignEntireWeekEvenly" });
    } else if (body.action === "savePerson") {
      if (!isRonApprover) return bad("Only Ron can manage people.", 403);
      if (!Number.isInteger(id) || id < 1) return bad("Choose a person to edit.");
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) return bad("Enter a person's name.");
      const prior = await database.prepare("SELECT name FROM people WHERE id = ? AND active = 1").bind(id).first<{ name: string }>();
      if (!prior) return bad("Person not found.", 404);
      await database.batch([database.prepare("UPDATE people SET name = ? WHERE id = ?").bind(name, id), event(database, "Ron", `Ron renamed ${prior.name} to ${name}`)]);
    } else if (body.action === "archivePerson") {
      if (!isRonApprover) return bad("Only Ron can manage people.", 403);
      if (id === 1) return bad("Ron cannot be removed.");
      const prior = await database.prepare("SELECT name FROM people WHERE id = ? AND active = 1").bind(id).first<{ name: string }>();
      if (!prior) return bad("Person not found.", 404);
      await database.batch([database.prepare("UPDATE people SET active = 0 WHERE id = ?").bind(id), database.prepare("UPDATE trade_requests SET status = 'cancelled', responded_at = ? WHERE status = 'pending' AND (requester_id = ? OR recipient_id = ?)").bind(new Date().toISOString(), id, id)]);
      await redistribute(database, `${prior.name} left`);
      await event(database, "Ron", `Ron removed ${prior.name} from the household`).run();
    } else if (body.action === "saveChore") {
      const title = String(body.title ?? "").trim().slice(0, 80);
      const emoji = String(body.emoji ?? "✨").trim().slice(0, 8) || "✨";
      const points = Number(body.points);
      const frequency = String(body.frequency ?? "");
      const days = Array.isArray(body.days) ? selectedDays(body.days.join(",")).join(",") : "";
      if (!title || !Number.isInteger(points) || points < 1 || points > 5 || !["weekly", "biweekly", "monthly", "bimonthly", "days"].includes(frequency) || (frequency === "days" && !days)) return bad("Enter a chore, effort from 1 to 5, and a valid schedule.");
      if (Number.isInteger(id) && id > 0) {
        const prior = await database.prepare("SELECT title, emoji, points, frequency, days FROM chores WHERE id = ? AND active = 1").bind(id).first<Chore>();
        if (!prior) return bad("Chore not found.", 404);
        const changes = [prior.title !== title ? `${prior.title} → ${title}` : "", prior.emoji !== emoji ? `${prior.emoji} → ${emoji}` : "", prior.points !== points ? `${prior.points}pt → ${points}pt` : "", prior.frequency !== frequency || prior.days !== days ? `${scheduleLabel(prior.frequency, prior.days)} → ${scheduleLabel(frequency, days)}` : ""].filter(Boolean).join(", ");
        if (changes) await database.batch([
          database.prepare("UPDATE chores SET title = ?, emoji = ?, points = ?, frequency = ?, days = ? WHERE id = ?").bind(title, emoji, points, frequency, days, id),
          database.prepare("UPDATE assignments SET title_snapshot = ?, points_snapshot = ? WHERE chore_id = ? AND completed_at IS NULL").bind(title, points, id),
          event(database, actor.name, `${actor.name} changed ${prior.title}: ${changes}`),
        ]);
      } else await database.batch([database.prepare("INSERT INTO chores (title, emoji, points, frequency, days, active) VALUES (?, ?, ?, ?, ?, 1)").bind(title, emoji, points, frequency, days), event(database, actor.name, `${actor.name} added ${emoji} ${title} (${points}pt, ${scheduleLabel(frequency, days)})`)]);
    } else if (body.action === "archiveChore") {
      const prior = await database.prepare("SELECT title FROM chores WHERE id = ? AND active = 1").bind(id).first<{ title: string }>();
      if (!prior) return bad("Chore not found.", 404);
      await database.batch([database.prepare("UPDATE chores SET active = 0 WHERE id = ?").bind(id), database.prepare("DELETE FROM chore_preferences WHERE chore_id = ?").bind(id), event(database, actor.name, `${actor.name} removed ${prior.title} from future schedules`)]);
    } else return bad("Unknown action.");
    const reminderAssignments = await database.prepare("SELECT a.*, c.frequency FROM assignments a JOIN chores c ON c.id = a.chore_id WHERE a.superseded_by_assignment_id IS NULL ORDER BY a.id").all<Assignment>();
    await syncReminders(reminderAssignments.results).catch(console.error);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Your change could not be saved. Please try again." }, { status: 500 });
  }
}

async function redistribute(database: D1Database, reason: string, options: { overdueOnly?: boolean; includeCompleted?: boolean; ignorePreferences?: boolean } = {}) {
  const { today, weekStart } = householdCalendar();
  const weekEnd = dateAdd(weekStart, 6);
  const assignmentQuery = options.includeCompleted
    ? database.prepare("SELECT a.id, a.chore_id, a.person_id, a.title_snapshot, a.points_snapshot, a.due_date, a.completed_at, p.name AS person_name FROM assignments a JOIN people p ON p.id = a.person_id WHERE a.superseded_by_assignment_id IS NULL AND a.scheduled_date BETWEEN ? AND ? ORDER BY a.points_snapshot DESC, a.due_date, a.id").bind(weekStart, weekEnd)
    : options.overdueOnly
      ? database.prepare("SELECT a.id, a.chore_id, a.person_id, a.title_snapshot, a.points_snapshot, a.due_date, a.completed_at, p.name AS person_name FROM assignments a JOIN people p ON p.id = a.person_id WHERE a.superseded_by_assignment_id IS NULL AND a.completed_at IS NULL AND a.due_date < ? ORDER BY a.points_snapshot DESC, a.due_date, a.id").bind(today)
      : database.prepare("SELECT a.id, a.chore_id, a.person_id, a.title_snapshot, a.points_snapshot, a.due_date, a.completed_at, p.name AS person_name FROM assignments a JOIN people p ON p.id = a.person_id WHERE a.superseded_by_assignment_id IS NULL AND a.completed_at IS NULL ORDER BY a.points_snapshot DESC, a.due_date, a.id");
  const [peopleResult, openResult, completedResult, preferencesResult, tradesResult, assignmentsResult] = await database.batch([
    database.prepare("SELECT * FROM people WHERE active = 1 ORDER BY id"),
    assignmentQuery,
    database.prepare("SELECT chore_id, person_id, points_snapshot, completed_at FROM assignments WHERE completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC"),
    database.prepare("SELECT person_id, chore_id, strength FROM chore_preferences"),
    database.prepare("SELECT t.requester_id, t.recipient_id, offered.chore_id AS offered_chore_id, requested.chore_id AS requested_chore_id FROM trade_requests t JOIN assignments offered ON offered.id = t.offered_assignment_id JOIN assignments requested ON requested.id = t.requested_assignment_id WHERE t.status = 'accepted' ORDER BY t.responded_at DESC LIMIT 100"),
    database.prepare("SELECT id, person_id, scheduled_date, due_date, completed_at, points_snapshot FROM assignments WHERE superseded_by_assignment_id IS NULL"),
  ]);
  const people = peopleResult.results as Person[];
  const open = openResult.results as (Pick<Assignment, "id" | "chore_id" | "person_id" | "title_snapshot" | "points_snapshot" | "due_date" | "completed_at"> & { person_name: string })[];
  const completed = completedResult.results as Pick<Assignment, "chore_id" | "person_id" | "points_snapshot" | "completed_at">[];
  if (!people.length) return;
  const weeklyLoad = new Map(people.map((person) => [person.id, 0]));
  const reassignedIds = new Set(open.map((item) => item.id));
  for (const item of assignmentsResult.results as Assignment[]) {
    if (reassignedIds.has(item.id) || !weeklyLoad.has(item.person_id)) continue;
    if (item.scheduled_date >= weekStart && item.scheduled_date <= weekEnd) weeklyLoad.set(item.person_id, (weeklyLoad.get(item.person_id) ?? 0) + item.points_snapshot);
  }
  const recentOwners = new Map<number, number[]>();
  for (const item of completed) {
    const owners = recentOwners.get(item.chore_id) ?? [];
    if (owners.length < 4) owners.push(item.person_id);
    recentOwners.set(item.chore_id, owners);
  }
  const preferences = options.ignorePreferences ? new Map<string, number>() : preferenceMap(preferencesResult.results as Preference[]);
  const tradeAffinity = tradeAffinityMap(tradesResult.results as TradeSignal[]);
  const targetLoad = ([...weeklyLoad.values()].reduce((total, points) => total + points, 0) + open.reduce((total, item) => total + item.points_snapshot, 0)) / people.length;
  const statements: D1PreparedStatement[] = [];
  let moved = 0;
  for (const item of open) {
    const selected = chooseAssignee(people, item.chore_id, item.points_snapshot, weeklyLoad, targetLoad, recentOwners.get(item.chore_id) ?? [], preferences, tradeAffinity);
    weeklyLoad.set(selected.id, (weeklyLoad.get(selected.id) ?? 0) + item.points_snapshot);
    if (selected.id !== item.person_id) {
      statements.push(database.prepare(options.includeCompleted ? "UPDATE assignments SET person_id = ? WHERE id = ?" : "UPDATE assignments SET person_id = ? WHERE id = ? AND completed_at IS NULL").bind(selected.id, item.id));
      statements.push(event(database, "Ron", `Ron reassigned ${item.title_snapshot}: ${item.person_name} → ${selected.name}`));
      moved++;
    }
  }
  if (statements.length) await database.batch(statements);
  await event(database, "Ron", `Ron balanced ${open.length} ${options.includeCompleted ? "chores from this week" : "unfinished chores"} across ${people.length} people after ${reason} (${moved} reassigned)`).run();
}
