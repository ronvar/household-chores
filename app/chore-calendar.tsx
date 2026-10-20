"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock3 } from "lucide-react";
import { calendarAdd, completionStatus } from "../lib/chore-schedule";
import styles from "./chore-calendar.module.css";

type CalendarAssignment = {
  id: number;
  scheduled_date: string;
  due_date: string;
  available_date?: string;
  completed_at: string | null;
  repeated?: boolean;
};

type CalendarProps<Item extends CalendarAssignment> = {
  items: Item[];
  today: string;
  weekStart: string;
  renderTask: (item: Item) => ReactNode;
};

function formatDay(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

function dayDistance(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
}

function windowStart(item: CalendarAssignment) {
  const start = item.available_date ?? (item.repeated ? item.due_date : item.scheduled_date);
  return start <= item.due_date ? start : item.due_date;
}

function windowCopy(item: CalendarAssignment) {
  const start = windowStart(item);
  const end = item.due_date;
  if (start === end) return `Complete on ${formatDay(end, { weekday: "long" })}`;
  if (dayDistance(start, end) === 6) return "Any time this week";
  return `Any time ${formatDay(start, { weekday: "long" })}–${formatDay(end, { weekday: "long" })}`;
}

export default function ChoreCalendar<Item extends CalendarAssignment>({ items, today, weekStart, renderTask }: CalendarProps<Item>) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const end = calendarAdd(weekStart, 6);
  const dates = Array.from({ length: 7 }, (_, index) => calendarAdd(weekStart, index));
  const earlier = items.filter((item) => item.due_date < weekStart);
  const carryovers = earlier.filter((item) => completionStatus(item, today, weekStart) !== "missed");
  const missedTurns = earlier.filter((item) => completionStatus(item, today, weekStart) === "missed");
  const current = items.filter((item) => item.due_date >= weekStart && item.due_date <= end);
  const todayIndex = dayDistance(weekStart, today);

  return <div className={styles.calendar}>
    <div className={styles.calendarCaption}><span><CalendarDays size={17} aria-hidden="true" />{formatDay(weekStart, { month: "short", day: "numeric" })} – {formatDay(end, { month: "short", day: "numeric", year: "numeric" })}</span><span>{items.length} pending</span></div>
{!!carryovers.length && <section className={styles.carryover} aria-label="Overdue carry-over chores"><div className={styles.carryoverHeading}><Clock3 size={18} aria-hidden="true" /><div><h3>Overdue carry-over</h3><p>Earlier deadlines · still yours to finish</p></div></div>{carryovers.map((item) => <div className={styles.carryoverTask} key={item.id}>{renderTask(item)}</div>)}</section>}
    {wide ? <div className={styles.desktop} aria-label="Pending chores and their completion windows">
      <div className={styles.desktopHeader}><div className={styles.headerLabel}>Pending chores<span>Available window → deadline</span></div><div className={styles.dayHeaders}>{dates.map((date) => <div className={date === today ? styles.today : ""} key={date} aria-current={date === today ? "date" : undefined}><span>{formatDay(date, { weekday: "short" })}</span><strong>{formatDay(date, { day: "numeric" })}</strong></div>)}</div></div>
      {current.length ? current.map((item) => {
        const start = Math.max(0, dayDistance(weekStart, windowStart(item)));
        const last = Math.min(6, dayDistance(weekStart, item.due_date));
        const status = completionStatus(item, today, weekStart);
        const difference = dayDistance(today, item.due_date);
        const tone = status === "missed" || status === "early" ? styles.waiting : difference <= 0 ? styles.urgent : difference <= 2 ? styles.soon : styles.later;
        return <div className={styles.desktopRow} key={item.id}><div className={styles.label}>{renderTask(item)}</div><div className={styles.timeline} style={{ "--today-index": todayIndex, "--show-today": todayIndex >= 0 && todayIndex < 7 ? 1 : 0 } as CSSProperties}><div className={`${styles.band} ${tone}`} style={{ gridColumn: `${Math.min(start, last) + 1} / ${last + 2}` }} title={`${windowCopy(item)} · deadline ${formatDay(item.due_date, { weekday: "long", month: "short", day: "numeric" })}`}>
          {last > start && <span className={styles.bandCopy}>{status === "missed" ? "Window closed" : status === "early" ? "Not your turn yet" : last - start === 6 ? "Any time this week" : `${formatDay(windowStart(item), { weekday: "short" })}–${formatDay(item.due_date, { weekday: "short" })}`}</span>}
          <span className={styles.bandDeadline}><small>{status === "missed" ? "Missed" : "Due"}</small><strong>{formatDay(item.due_date, { weekday: "short" })}</strong></span>
        </div></div></div>;
      }) : <div className={styles.empty}>No pending chores this week.</div>}
      <div className={styles.legend}><span><i />Available window</span><span><i className={styles.legendDeadline} />Deadline</span><span>Do it any time in between</span></div>
    </div> : <div className={styles.mobile} aria-label="Pending chores">{current.map((item) => <div className={styles.mobileTask} key={item.id}><div className={styles.label}>{renderTask(item)}</div></div>)}{!current.length && <div className={styles.empty}>No pending chores this week.</div>}</div>}
    {!!missedTurns.length && <details className={styles.pastMisses}><summary><span>Past missed turns <span className={styles.missedCount}>{missedTurns.length}</span></span><ChevronDown size={18} aria-hidden="true" /></summary><p>Closed windows stay recorded. Next week’s matching turn stays with the person who missed it.</p>{missedTurns.map((item) => <div className={styles.carryoverTask} key={item.id}>{renderTask(item)}</div>)}</details>}
  </div>;
}
