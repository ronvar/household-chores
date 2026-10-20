import type { ReactNode } from "react";
import HouseholdCard from "./household-card";
import { completionTiming } from "../lib/completion-history";

export default function CompletedChoreCard({ title, name, avatar, completedAt, dueDate, className = "" }: { title: string; name: string; avatar?: ReactNode; completedAt: string; dueDate: string; className?: string }) {
  const completed = new Date(completedAt);
  const timing = completionTiming(completedAt, dueDate);
  const date = completed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
  const time = completed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const deadline = new Date(`${dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });

  return <HouseholdCard title={title} className={`completion-card ${className}`}>
    <span className="history-avatar" role="img" aria-label={`${name}'s profile`}>{avatar ?? <span className="avatar">{name.charAt(0).toUpperCase()}</span>}</span>
    <div className="record-copy"><strong>{title}</strong><span>{name} completed it</span></div>
    <div className="history-record-badges">
      <span className={`history-timing-badge ${timing.late ? "late" : "on-time"}`} title={`Due ${deadline}`}>{timing.label}</span>
      <time className="history-time-badge" dateTime={completedAt} aria-label={`Completed ${date} at ${time}`}><span>{date}</span><span>{time}</span></time>
    </div>
  </HouseholdCard>;
}
