export function completionTiming(completedAt: string, dueDate: string) {
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) return { label: "Unknown", late: false };
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(completed);
  const daysLate = Math.round((Date.parse(`${localDay}T12:00:00Z`) - Date.parse(`${dueDate}T12:00:00Z`)) / 86400000);
  if (daysLate <= 0) return { label: "On time", late: false };
  if (daysLate < 7) return { label: "Late", late: true };
  const weeks = Math.floor(daysLate / 7);
  return { label: `${weeks} ${weeks === 1 ? "week" : "weeks"} late`, late: true };
}
