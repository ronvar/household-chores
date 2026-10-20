declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RON_APPROVER_EMAIL?: string;
    VAPID_PUBLIC_KEY?: string;
    REMINDER_WORKER_URL?: string;
    REMINDER_WORKER_SECRET?: string;
  }
}
