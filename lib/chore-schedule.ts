export function calendarAdd(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function completedOnTime(assignment: { completed_at: string | null; due_date: string }) {
  if (!assignment.completed_at) return false;
  const completedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(assignment.completed_at));
  return completedDate <= assignment.due_date;
}

export function completedInHouseholdWeek(completedAt: string | null, weekStart: string) {
  if (!completedAt) return false;
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(completed);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  const local = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}`;
  return local >= `${weekStart}T09` && local < `${calendarAdd(weekStart, 7)}T09`;
}

export function completionStatus(assignment: { scheduled_date: string; due_date: string; available_date?: string | null; completed_at: string | null; repeated?: boolean; frequency_snapshot?: string | null }, today: string, weekStart: string) {
  if (assignment.completed_at) return "completed";
  if (assignment.available_date && assignment.available_date > today) return "early";
  if (assignment.due_date < today && (assignment.repeated || assignment.frequency_snapshot === "days" || (assignment.scheduled_date >= weekStart && assignment.scheduled_date <= calendarAdd(weekStart, 6)))) return "missed";
  return "available";
}

export function selectedDays(days: string) {
  return [...new Set(days.split(",").filter(Boolean).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
}

export function canTradeAssignment(assignment: { scheduled_date: string; due_date: string; completed_at: string | null; available_date?: string | null; repeated?: boolean; frequency_snapshot?: string | null; frequency?: string }, today: string, weekStart: string) {
  const repeated = assignment.repeated ?? ((assignment.frequency_snapshot ?? assignment.frequency) === "days" && assignment.scheduled_date === assignment.due_date);
  return !assignment.completed_at && completionStatus({ ...assignment, repeated }, today, weekStart) !== "missed";
}

export function completionStart(due: string, days: string, previousDue?: string) {
  const weekdays = selectedDays(days);
  let previous = previousDue;
  if (!previous) {
    for (let offset = 1; offset <= 7; offset++) {
      const candidate = calendarAdd(due, -offset);
      if (weekdays.includes(new Date(`${candidate}T12:00:00Z`).getUTCDay())) {
        previous = candidate;
        break;
      }
    }
  }
  return previous ? calendarAdd(previous, 1) : due;
}
