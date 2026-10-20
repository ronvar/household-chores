# Household Chores

A responsive chore-management app for a shared household, with recurring assignments, effort balancing, preferences, trades, and push reminders.

## Features

- Calendar and list views, with each device remembering its preferred view and person.
- Weekly, biweekly, monthly, every-two-months, and selected-day schedules.
- Separate completion windows for repeated chores, including deadlines and locked missed turns.
- Effort-based assignment balancing with preferences and recent chore and trade history.
- Overdue weekly carry-over without duplicating assignments or discounting new weekly work.
- Confirmed completion, undo, per-person progress, and local-time completion history.
- Trades that require acceptance, identify specific turns, and reject expired windows.
- Administrator-managed people, approvals, chore editing, and individual reassignment.
- Installable Home Screen app with Web Push reminders.

## Stack

React, TypeScript, Vinext/Vite, Cloudflare Workers, D1, Drizzle, and Web Push. The reminder service is a separate Worker under `reminder-worker/`.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

The development server normally starts on port 5173. Copy `.dev.vars.example` to ignored `.dev.vars` and configure the needed values. The development platform integration includes a loopback-only test identity; production administrator access must use a verified identity matching `RON_APPROVER_EMAIL`.

```sh
npm run build
npm run start -- --port 8788
```

Apply the schema migrations in `drizzle/` to a local D1 database before using household data. Local databases and hosted databases are separate. Never replay already-applied migrations.

## Configuration

- `RON_APPROVER_EMAIL`: verified administrator email.
- `VAPID_PUBLIC_KEY`: public Web Push key shared by the app and reminder Worker.
- `REMINDER_WORKER_URL`: deployed reminder Worker URL.
- `REMINDER_WORKER_SECRET`: secret used by the app to authenticate to the reminder Worker.

The reminder Worker also requires `SYNC_SECRET` (matching `REMINDER_WORKER_SECRET`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `HOUSEHOLD_SITE_URL` pointing to the app's HTTPS origin.

Set secrets through the deployment environment or Worker secret commands, never in tracked files. Create your own D1 databases and replace the placeholder database ID in `reminder-worker/wrangler.jsonc`. The hosting manifest retains the logical `DB` binding but does not contain the original deployment's project ID.

## Authentication and hosting

Selecting a person identifies this device's chore view; it is not account authentication. Administrator actions separately require the hosting platform's verified identity. The server-side authentication adapter and reserved sign-in routes are retained so those checks remain intact. Deploying outside the original platform requires integrating an equivalent verified identity provider; do not remove the administrator check.

This repository contains application source only. It does not contain household database contents, profile uploads, push subscriptions, credentials, or the original hosting account's configuration. Importing the repository does not move the existing live site or automatically synchronize future changes to it.

## Scheduling and progress

The household week begins Monday at 9am in America/Los_Angeles, including daylight-saving changes. Overdue weekly chores stay with their owner; new work is balanced independently of that backlog. Selected-day occurrences have independent completion windows and can belong to different people.

Weekly progress includes current-week assignments and older chores completed during that household week, once per assignment. Completion history records the actual completer and displays device-local timestamps. Older records remain in History.

## Reminders

The reminder Worker checks the live board using the same completion-eligibility rules as the interface. Completed chores, unopened windows, and locked missed turns do not inflate the notification or badge count. Valid overdue carry-over remains eligible. If the board cannot be verified, delivery is skipped instead of using stale counts.

Due-day reminders run at 10am, 2pm, and 6pm in each device's timezone; overdue-only reminders run at 6pm. Delivery slots are claimed per subscription to avoid duplicates. Device notification and Focus settings still control presentation.

## Project structure

- `app/`: household UI, API routes, and authentication adapter.
- `lib/`: shared scheduling and completion rules.
- `db/` and `drizzle/`: schema and migrations.
- `public/`: app icons, manifest, and service worker.
- `reminder-worker/`: push subscriptions and scheduled reminder delivery.
- `docs/ui-verification.md`: release verification checklist.

Third-party license notices are retained alongside their corresponding files.
