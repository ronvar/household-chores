import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const household = sqliteTable("household", {
  id: integer("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active").notNull().default(1),
  profileImage: text("profile_image"),
});

export const chores = sqliteTable("chores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  emoji: text("emoji").notNull().default("✨"),
  points: integer("points").notNull().default(1),
  frequency: text("frequency").notNull(),
  days: text("days").notNull().default(""),
  active: integer("active").notNull().default(1),
});

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  choreId: integer("chore_id").notNull().references(() => chores.id),
  personId: integer("person_id").notNull().references(() => people.id),
  scheduledDate: text("scheduled_date").notNull(),
  dueDate: text("due_date").notNull(),
  availableDate: text("available_date"),
  frequencySnapshot: text("frequency_snapshot"),
  daysSnapshot: text("days_snapshot"),
  completedAt: text("completed_at"),
  completedByPersonId: integer("completed_by_person_id").references(() => people.id),
  completedByName: text("completed_by_name"),
  supersededByAssignmentId: integer("superseded_by_assignment_id"),
  titleSnapshot: text("title_snapshot").notNull(),
  pointsSnapshot: integer("points_snapshot").notNull(),
}, (table) => [uniqueIndex("idx_assignments_chore_date").on(table.choreId, table.scheduledDate)]);

export const personRequests = sqliteTable("person_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
  personId: integer("person_id").references(() => people.id),
});

export const boardEvents = sqliteTable("board_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorName: text("actor_name").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const chorePreferences = sqliteTable("chore_preferences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull().references(() => people.id),
  choreId: integer("chore_id").notNull().references(() => chores.id),
  strength: integer("strength").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_chore_preferences_person_chore").on(table.personId, table.choreId)]);

export const tradeRequests = sqliteTable("trade_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requesterId: integer("requester_id").notNull().references(() => people.id),
  recipientId: integer("recipient_id").notNull().references(() => people.id),
  offeredAssignmentId: integer("offered_assignment_id").notNull().references(() => assignments.id),
  requestedAssignmentId: integer("requested_assignment_id").notNull().references(() => assignments.id),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  respondedAt: text("responded_at"),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  personId: integer("person_id").notNull().references(() => people.id),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  timezone: text("timezone").notNull(),
  lastSentDate: text("last_sent_date"),
  createdAt: text("created_at").notNull(),
});
