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
CREATE TABLE IF NOT EXISTS turn_notifications (
  endpoint TEXT NOT NULL REFERENCES subscriptions(endpoint) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  available_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (endpoint, assignment_id, person_id, available_date, due_date)
);
