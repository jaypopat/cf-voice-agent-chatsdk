/**
 * Secrets (set via `wrangler secret put`, not in wrangler.jsonc) merged into the
 * generated `Env`. Bindings/vars come from wrangler.jsonc via `wrangler types`.
 */
interface Env {
  // Browser voice auth (Plan 2)
  BROWSER_AUTH_TOKEN: string;
  GOOGLE_CALENDAR_ID: string;
  // Google Calendar (Plan 4)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  TELEGRAM_ALLOWED_CHAT_ID: string;
  // Telegram (Plan 3)
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string;
  // Reminders/timezone (Plan 4/5)
  USER_TZ: string;
}
