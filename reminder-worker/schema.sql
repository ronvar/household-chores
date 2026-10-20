CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  timezone TEXT NOT NULL,
  last_sent_date TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS open_assignments (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL,
  due_date TEXT NOT NULL
);
