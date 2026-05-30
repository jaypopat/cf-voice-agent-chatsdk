# Setup

One-time provisioning to make the assistant actually run. Everything below is for **your own** single-user instance. Commands use Bun (`bunx wrangler …`).

## 1. Cloudflare account + Vectorize index

```bash
bunx wrangler login
# Create the semantic-memory index (1024 dims = qwen3-embedding-0.6b, cosine):
bun run provision          # = wrangler vectorize create assistant-memory --dimensions=1024 --metric=cosine
```

Workers AI + Vectorize have **no local simulation** — use `bunx wrangler dev --remote` (costs Neurons) or a deploy to exercise them.

## 2. Telegram bot

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → note the **bot token** and **username**.
2. Find **your own numeric chat id** (DM [@userinfobot](https://t.me/userinfobot), or `getUpdates` after messaging your bot). In a DM the chat id equals your user id — this is the allowlist.
3. Pick a random **webhook secret token** (any opaque string).
4. After your first deploy (step 5), register the webhook (URL routes to the MessengerAgent instance `main`):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<your-worker-subdomain>.workers.dev/agents/messenger-agent/main","secret_token":"<TELEGRAM_WEBHOOK_SECRET_TOKEN>"}'
```

## 3. Google Calendar (OAuth refresh token)

1. Google Cloud Console → create a project → enable the **Google Calendar API**.
2. Create an **OAuth 2.0 Client ID** (type: Web app or Desktop). Note the **client id** + **client secret**.
3. Get a **refresh token** for your own account with scope `https://www.googleapis.com/auth/calendar` (use the [OAuth Playground](https://developers.google.com/oauthplayground/): set your own client id/secret in settings, authorize the Calendar scope, exchange for tokens, copy the refresh token).
4. `GOOGLE_CALENDAR_ID` is usually `primary`.

The client uses raw `fetch` (no `googleapis` lib): it exchanges the refresh token for an access token, caches it in the `google_token` table, and refreshes on 401.

## 4. Secrets

All secrets are set with `wrangler secret put <NAME>` (production) and listed in `.dev.vars` for local `wrangler dev` (see `.dev.vars.example`).

| Secret | What |
|---|---|
| `BROWSER_AUTH_TOKEN` | shared bearer token the web app sends (`?token=`) to open the voice WS |
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `TELEGRAM_BOT_USERNAME` | your bot's @username (no `@`) |
| `TELEGRAM_ALLOWED_CHAT_ID` | your numeric chat id — the only sender answered |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | the secret you set in `setWebhook` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client |
| `GOOGLE_REFRESH_TOKEN` | your Calendar refresh token |
| `GOOGLE_CALENDAR_ID` | usually `primary` |
| `USER_TZ` | your IANA timezone, e.g. `America/New_York` (resolves relative times) |

```bash
for s in BROWSER_AUTH_TOKEN TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME \
         TELEGRAM_ALLOWED_CHAT_ID TELEGRAM_WEBHOOK_SECRET_TOKEN \
         GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN \
         GOOGLE_CALENDAR_ID USER_TZ; do bunx wrangler secret put "$s"; done
```

The web app needs `VITE_BROWSER_AUTH_TOKEN` (same value as `BROWSER_AUTH_TOKEN`) at build time — put it in `web/.env` (see `web/.env.example`).

## 5. Build + deploy

```bash
bun run build:web        # produces web/dist (served as static assets)
bunx wrangler deploy     # uploads the Worker + 4 Durable Objects + assets
```

Then register the Telegram webhook (step 2.4). Open `https://<worker>.workers.dev/` for the voice UI, and DM your bot to chat from your phone.

## 6. Verify (live e2e — needs the bindings above)

- **Brain:** DM the bot _"remember my dentist is Dr. Lee"_, then _"who is my dentist?"_ → should recall + cite.
- **Voice:** open the web app, Start call, speak — you hear a spoken reply.
- **Confirm gate:** _"schedule lunch with Sam Friday 12pm"_ → a Confirm card appears → tap Confirm → event created, receipt pushed.
- **Reminder:** _"remind me to stretch in 2 minutes"_ → confirm → the reminder pushes to Telegram when it fires.

> Vectorize inserts take a few seconds to become queryable, so a just-captured fact may briefly lag in recall.
