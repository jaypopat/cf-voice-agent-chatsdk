# Voice-to-Action Assistant — Design Spec

- **Date:** 2026-05-29
- **Status:** Draft, pending user confirmation
- **What it is:** A complete, single-user personal assistant you **talk to** that **takes real actions** (schedules calendar events, sets reminders) and **remembers everything** — reachable by live browser voice and by Telegram, backed by one durable per-user brain on Cloudflare.
- **Not** a phased PoC. This designs the whole product. (A build *order* exists in §15, but every piece is in scope.)

---

## 1. Vision — the moment it has to nail

> You're at your desk, mid-thought. You say (browser mic): *"Schedule a dentist appointment Thursday afternoon, and remind me to bring my insurance card."* The assistant replies out loud: *"I've put a dentist appointment Thursday 2pm and a reminder up for your confirmation."* Your phone buzzes — Telegram: **📅 Dentist — Thu 2:00pm  ⏰ Bring insurance card — Thu 1pm  [Confirm] [Change]**. One tap. *"Booked."* Thursday at 1pm your phone buzzes again: *"⏰ Bring your insurance card."*
>
> Later, from your phone: *"what did I tell Maria I'd send her?"* → *"You said you'd send the Q3 deck (you mentioned it Tuesday). Want me to set a reminder?"*

Three properties make that feel magical, and they define the build:

1. **Voice-to-action** — you speak an intent, it *does the thing*, not just notes it.
2. **Confirm-before-mutate, cross-channel** — speak at your desk, confirm with a tap on your phone. Trust + the standout demo.
3. **Memory is the substrate** — actions and answers draw on everything you've ever said.

---

## 2. Decisions log (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Relationship to rewindos | **Standalone**, no integration | rewindos is local-first/Linux/Tauri; this is CF-cloud. Embedding would break its "all data stays on your machine" promise and share no runtime. |
| Audience | **Single-user (you), built complete** | Multi-tenancy is undifferentiated plumbing (per-user OAuth, accounts, billing) that adds zero magic. A complete product for one user is not "half-baked." |
| Product type | **Voice-to-action assistant** | Chosen over pure "second brain" and a vertical logger. |
| Core action set | **Google Calendar + reminders** (tight) | Most universal, demoable, lowest-risk actions. Master these; email/messaging is the obvious next expansion. |
| Intelligence | **Agentic loop** (tools), in *both* recall and action | The model decides per turn: answer from memory (cited), propose an action (→ confirm), or capture. Right call for a real product. |
| Recall | **Semantic** (Vectorize + embeddings) | Meaning-based recall makes "ask and get it back" actually work. Beats FTS5/LIKE. |
| Voice input | **Browser mic** (live conversation) | Best real-time voice UX (streaming STT in, spoken out). Reframes product to "talk to it at your device." |
| Reach channel | **Telegram** | Reminders/confirms must reach you off-device. Reliable mobile push + tap-to-confirm. Keeps the "one brain, many channels" thesis. |
| Telephony (Twilio/Telnyx) | **Out** | Twilio packages unpublished/empty; Telnyx is `0.0.2`. Browser+Telegram sidesteps the whole mess. Revisit only if true hands-free becomes a requirement. |

---

## 3. Scope

**In (the complete product):**
- Live **browser voice** conversation (talk to it; spoken replies).
- **Telegram**: text capture, recall, confirm buttons, reminder/confirm push.
- **Agentic brain**: reason → use memory → answer (cited) or propose action.
- **Semantic memory** of every interaction (Vectorize + embeddings).
- **Actions**: Google Calendar create/move/cancel; reminders (one-off, scheduled).
- **Confirm gate**: every real-world mutation bundled into a one-tap Telegram confirm before it executes; idempotent execution.

**Explicitly out (name in README):**
- Telephony (phone calls), voice notes inside chat.
- Email/messaging actions (the planned *next* expansion, not now).
- Multi-tenant signup / billing.
- Notion/Linear/etc. integrations, daily digests, "learns your routines" personalization.
- Rigid 4-bucket classification (the agentic loop subsumes it).

---

## 4. Architecture

Three agents we write + one re-exported. Single-user → the brain is a single `AssistantAgent` instance (name `"main"`); both ingress paths address it.

```
  Browser (web/)                              Telegram (your phone)
   useVoiceAgent                               text + [Confirm] buttons + pushes
        │ WS                                        │ webhook
        ▼                                            ▼
  ┌─ VoiceAgent (withVoice(Agent)) ─┐        ┌─ MessengerAgent (Agent + Vercel Chat SDK) ─┐
  │  Flux STT in / Aura TTS out      │        │  onMessage(text) → brain.handleTurn         │
  │  onTurn(t) → brain.streamReply   │        │  onAction("confirm") → brain.confirm        │
  │    → speak streamed tokens       │        │  notify(card)  ← brain pushes confirms/      │
  └──────────────┬───────────────────┘        │                   reminders (chat.thread.post)│
                 │ DO RPC (ReadableStream)     └──────────────┬───────────────────────────────┘
                 │                                            │ DO RPC
                 ▼                                            ▼
         ┌────────────────── AssistantAgent ("main") — THE BRAIN ──────────────────┐
         │  agentic loop: generateText/streamText + tools (kimi-k2.6, stepCountIs)  │
         │  tools: search_memory · propose_event · propose_reminder · save_note      │
         │  memory: SQLite (records) + Vectorize (embeddings, qwen3-embedding-0.6b)  │
         │  actions: Google Calendar REST · reminders via this.schedule(Date,…)      │
         │  confirm gate: pending_action rows → confirm() → idempotent exec fiber    │
         └──────────────────────────────────────────────────────────────────────────┘

  ChatSdkStateAgent ← export { ChatSdkStateAgent } from "agents/chat-sdk"
                       (persists the Vercel Chat SDK's locks/queues/dedupe on Workers)
```

**Why the brain is separate:** `VoiceAgent` and `MessengerAgent` are independent DOs sharing nothing. Centralizing the loop, memory, and actions in `AssistantAgent` means voice and Telegram are thin ingress skins over one brain — speak in the browser, the memory/action shows up on Telegram. That single shared instance *is* the product.

---

## 5. The brain — agentic loop

A method on `AssistantAgent`, reached from both channels:

```ts
streamReply(turn: { text: string; channel: "voice" | "telegram" }): ReadableStream<Uint8Array>
```

- Built on **`@cloudflare/ai-utils`** `runWithTools(env.AI, model, { messages, tools }, { maxRecursiveToolRuns: 8 })` — Cloudflare's native Workers-AI function-calling loop (chosen over the Vercel AI SDK for being CF-native; supports `streamFinalResponse` for Plan 2 voice streaming).
- **Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (the single `MODELS.llm`; function-calling capable, free-tier-friendly).
- Returns a `ReadableStream` so `VoiceAgent` speaks tokens as they arrive (DO→DO RPC supports stream returns). Telegram gets the final text (optionally streamed via message edits — refinement).
- **Tools** (`@cloudflare/ai-utils` format: `{ name, description, parameters: <JSON schema>, function }`; the `function` returns a JSON string):
  - `search_memory(query, topK?)` → embed query, Vectorize query, return records **with ids**; system prompt instructs the model to cite `[id]`.
  - `propose_event({ title, start, end?, location?, notes? })` → creates a `pending_action` (does **not** write to Calendar); returns the pending id.
  - `propose_reminder({ text, when })` → creates a `pending_action`; `when` resolved to an absolute datetime in the user's timezone.
  - `save_note({ text, tags? })` → stores a memory record immediately (no confirm; non-mutating to the outside world).
- After the loop, if any `pending_action`s were created this turn, the brain bundles them into **one** Telegram confirm Card and the reply tells the user to confirm there.

**System prompt** orchestrates: understand intent; pull context from memory before answering or acting; never mutate the outside world without a proposal+confirm; cite memory ids; keep spoken replies short.

---

## 6. Memory substrate

Every turn and action becomes a memory record; recall is semantic.

- **Source of truth:** `AssistantAgent` SQLite `memory` table (full records).
- **Index:** Cloudflare **Vectorize** — embedding via `@cf/qwen/qwen3-embedding-0.6b` (1024-dim, 4096-token window, cosine). Index created `--dimensions=1024 --metric=cosine`. Single-user → one index, no metadata filter needed (tag with a constant for future multi-user).
- **What's stored & embedded:** user turns, assistant answer summaries, saved notes, and action history ("scheduled Dentist for Jun 4"). So *"what did I tell Maria"* works because past turns are recallable.
- **Recall flow:** `search_memory` → `env.AI.run(embed, { text:[query] })` → `env.VECTORIZE.query(vec.data[0], { topK, returnMetadata:"all" })` → records (id + snippet) → model cites.
- **Caveat:** Vectorize inserts take a few seconds to become queryable; a just-captured item may briefly lag in recall (acceptable).

---

## 7. Actions

**Google Calendar** (`actions/calendar.ts`) — raw `fetch`, **no `googleapis` lib**:
- Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` (default `primary`).
- Exchange refresh→access token (`POST oauth2.googleapis.com/token`), **cache access token** (~1h) in Agent state, refresh on expiry/401.
- `events.insert` / `events.list` (conflict/availability) / `events.patch` (move) / `events.delete` (cancel).

**Reminders** (`actions/reminders.ts`):
- `this.schedule(new Date(fireAt), "fireReminder", { reminderId })` → DO-alarm-backed, survives restarts. Store the returned `schedule.id` on the reminder row to allow cancel (`this.cancelSchedule(id)`).
- `fireReminder(payload)` → push the reminder text to Telegram via `MessengerAgent.notify`.
- Natural-language time → absolute datetime resolved in the user's timezone (config `USER_TZ`); optionally aided by the SDK's `getSchedulePrompt()` / `scheduleSchema`.

---

## 8. The confirm gate (corrected mechanics)

Earlier framing ("a fiber suspends across the wait") was wrong. Correct, idempotent design:

```
1. brain loop calls propose_event / propose_reminder
      → INSERT pending_action(status='pending', batch_id)   [no external write]
2. brain bundles this turn's pendings → MessengerAgent.notify(<Card>…<Actions>
      <Button id="ok"  value="<batchId>"/><Button id="no" value="<batchId>"/>)   (callback_data ≤ 64B)
3. user taps Confirm → MessengerAgent.onAction("ok") → AssistantAgent.confirm(batchId)
4. confirm(): for each pending action →
      startFiber("exec:<actionId>", { idempotencyKey: actionId }, async (ctx) => {
        - Calendar: events.insert → store external_ref   (idempotent: skip if external_ref set)
        - Reminder: this.schedule(Date, "fireReminder", {id})
        - mark status='done'
      })
5. push "✅ Booked: …  ⏰ Reminder set." to Telegram
```

- The **fiber guards the external mutation** (durable, exactly-once even across eviction/retry) — that's where it's genuinely load-bearing. The "wait for the tap" is just a persisted `pending_action` row + a Telegram callback, not a blocked fiber.
- **Confirm lives on Telegram** (the reach channel — finds you anywhere, durable record). *Refinement:* if a live browser voice session is active, mirror the confirm there for immediacy; Telegram stays source of truth.
- `[Change]` → brain re-opens the proposal conversationally.

---

## 9. Channels

**Browser voice** (`agents/VoiceAgent.ts`, `web/`):
- `withVoice(Agent)`; `transcriber = new WorkersAIFluxSTT(this.env.AI)`, `tts = new WorkersAITTS(this.env.AI)` (aura-1, mp3 — browser decodes fine).
- `onTurn(transcript)` → `getAgentByName(env.AssistantAgent, "main").streamReply({text, channel:"voice"})` → speak streamed tokens.
- `sendText()` gives a free typed path through the same `onTurn`.
- `web/` = Vite+React using `useVoiceAgent` from `@cloudflare/voice/react`, served via Workers static assets.

**Telegram** (`agents/MessengerAgent.ts`):
- Vercel Chat SDK: `new Chat({ adapters: { telegram: createTelegramAdapter(...) }, state: createChatSdkState({ agent: env.ChatSdkStateAgent }) })`.
- Inbound text → `brain.streamReply({text, channel:"telegram"})` → reply.
- `onAction("ok"/"no", …)` → `brain.confirm` / cancel.
- `notify(card)` RPC + `chat.thread(chatId).post(...)` for backend-initiated confirm prompts and reminder pushes.
- State persisted on Workers by `ChatSdkStateAgent`.

**Channel-routing rule** (keeps the handler platform-agnostic so Discord/Slack are a cheap add later): conversational *replies* go to the channel the message came from (Chat SDK threads handle this); *proactive pushes* — reminders, and confirms for **voice-initiated** actions (which have no chat thread) — go to a single configured **primary reach channel** (`PRIMARY_REACH = telegram`). One platform now → no ambiguity; adding a second later only means choosing the primary and registering the adapter.

---

## 10. Identity / auth (single-user)

- **Telegram:** allowlist your `chatId` (secret `TELEGRAM_ALLOWED_CHAT_ID`); reject all others. The bot is otherwise public.
- **Browser:** the voice WS is public via `routeAgentRequest`; gate it with a shared bearer token (`BROWSER_AUTH_TOKEN`) checked in `onBeforeConnect`. The `web/` app holds the token.
- Both ingress paths resolve to `AssistantAgent` instance `"main"`.

---

## 11. Data model (`AssistantAgent` SQLite)

Persisted with **Drizzle** (`drizzle-orm/durable-sqlite`) over the Agent's Durable Object SQLite — schema in `src/memory/schema.ts`, queried via the Drizzle query builder (no raw SQL). The logical shape:

```
memory {
  id          text pk    // ulid
  kind        text       // turn | note | event | reminder
  text        text
  extracted   text       // json: {title?, entities?, tags?, ...}
  channel     text       // voice | telegram | system
  created_at  integer
  embedded    integer    // 0/1 — synced to Vectorize
}
pending_action {
  id          text pk    // SHORT id (≤64B callback budget)
  batch_id    text       // groups one turn's proposals into one confirm
  type        text       // event | reminder
  params      text       // json
  status      text       // pending | confirmed | done | failed | cancelled
  external_ref text      // calendar event id / null
  created_at  integer
}
reminder {
  id          text pk
  text        text
  fire_at     integer
  schedule_id text       // from this.schedule(), for cancel
  status      text       // scheduled | fired | cancelled
}
google_token { access_token text, expires_at integer }   // single-row cache
```
Vectorize holds `{ id, values, metadata:{ snippet, kind, created_at } }`.

---

## 12. Models & packages

**Models** (single set, free-tier-friendly — centralized in `src/config.ts` as `MODELS`, never hardcoded in logic):

| Purpose | Model |
|---|---|
| Agentic loop | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| STT (browser) | `@cf/deepgram/flux` |
| TTS (browser) | `@cf/myshell-ai/melotts` |
| Embeddings | `@cf/qwen/qwen3-embedding-0.6b` (1024-dim) |

**Cost reality:** everything but Workers AI is $0 at solo scale (incl. SQLite Durable Objects — now free). Workers AI has a shared **10,000 Neurons/day** free allowance across all models. With this set a voice turn ≈ ~900 Neurons (Flux STT ~700 + melotts TTS ~13 + llama loop ~200) → ~11 voice turns/day free; text turns are far cheaper. Text-first iteration stays $0; sustained daily voice needs **Workers Paid ($5/mo)** + cheap metered Neurons ($0.011/1k). Model ids live only in `MODELS`, so swapping later is a one-line change. (Dropped the earlier dev/prod profile split as over-engineering.)

| Package | Version | Note |
|---|---|---|
| `agents` | ~0.13.3 | core SDK (Agent, schedule, getAgentByName, routeAgentRequest, fibers) |
| `@cloudflare/voice` | ~0.2 | **beta** — withVoice, STT/TTS, `/react` `useVoiceAgent` |
| `chat` | ~4.29 | **Vercel** Chat SDK runtime (`new Chat`) |
| `@chat-adapter/telegram` | ~4.29 | Telegram adapter (JSX Cards/Buttons, `onAction`) |
| `@cloudflare/ai-utils` | ~1 | Workers-AI native tool-calling loop (`runWithTools`) — JSON-schema tools, no Vercel AI SDK |
| `zod` | ~3 | tool input schemas |

Import facts that bit the original sketch: `Chat` from `chat` (not `agents/chat-sdk`); `createChatSdkState`/`ChatSdkStateAgent` from `agents/chat-sdk`; voice helpers from `@cloudflare/voice`.

---

## 13. wrangler.jsonc

```jsonc
{
  "compatibility_date": "2026-05-29",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "assistant-memory" }],
  "assets": { "directory": "./web/dist" },
  "durable_objects": { "bindings": [
    { "name": "VoiceAgent",        "class_name": "VoiceAgent" },
    { "name": "MessengerAgent",    "class_name": "MessengerAgent" },
    { "name": "AssistantAgent",    "class_name": "AssistantAgent" },
    { "name": "ChatSdkStateAgent", "class_name": "ChatSdkStateAgent" }
  ]},
  "migrations": [{ "tag": "v1", "new_sqlite_classes":
    ["VoiceAgent","MessengerAgent","AssistantAgent","ChatSdkStateAgent"] }]
  // secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_ID, BROWSER_AUTH_TOKEN,
  //          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  //          GOOGLE_CALENDAR_ID, USER_TZ
}
// create index: wrangler vectorize create assistant-memory --dimensions=1024 --metric=cosine
```

---

## 14. Repo layout

```
src/
  index.ts                 # routeAgentRequest + Telegram webhook + browser auth gate
  agents/
    VoiceAgent.ts           # withVoice; browser mic; onTurn → brain.streamReply → speak
    MessengerAgent.ts        # Vercel Chat SDK; text + onAction(confirm); notify()
    AssistantAgent.ts        # THE BRAIN (loop + memory + actions + confirm + reminders)
    state.ts                 # export { ChatSdkStateAgent } from "agents/chat-sdk"
  brain/{loop.ts, tools.ts, prompt.ts}
  memory/{store.ts, vector.ts}
  actions/{calendar.ts, reminders.ts}
  confirm/gate.ts
  identity.ts
web/                       # Vite+React voice UI (useVoiceAgent)
wrangler.jsonc
README.md                  # scope, version pins, beta notes
```

---

## 15. Build order (construction sequence — all in scope)

1. **Brain memory core** — `AssistantAgent` + SQLite `memory` + Vectorize embed/upsert/query + `search_memory`. *Remembers & recalls.*
2. **Agentic loop** — `runWithTools` + tools (`search_memory`, `save_note`) + llama-3.3-70b. *Captures & answers with citations (test via RPC).*
3. **Browser voice** — `VoiceAgent` + `web/` `useVoiceAgent` → `brain.streamReply` spoken. *You can talk to it.*
4. **Telegram** — `MessengerAgent` text → brain; recall from phone. *One brain, two channels, proven.*
5. **Actions** — `calendar.ts` (Calendar REST) + `propose_event`/`propose_reminder` + `pending_action`.
6. **Confirm gate** — Telegram confirm Cards + `onAction` + idempotent exec fibers + reminder scheduling + push. *The full magic moment end-to-end.*
7. **Polish** — web UI, timezone/error handling, the demo script.

---

## 16. Considered & rejected

- **Merge into rewindos** — local-first vs cloud contradiction; no shared runtime. Standalone.
- **Code Mode** — the loop uses native AI SDK tool-calling, not generated-code orchestration of a large tool surface. Our tool set is small and fixed. Revisit only if integrations explode (the cut "becomes a product" scope).
- **Telephony (Twilio/Telnyx)** — unpublished/`0.0.2`; browser+Telegram is more reliable and sidesteps it. Deferred.
- **Multi-tenancy** — undifferentiated plumbing; single-user complete instead.
- **Discord / Slack (multi-platform)** — Chat SDK supports it cheaply, but a single-user assistant only needs *one* reach channel, and Discord adds app setup + Ed25519 interaction verification for no added magic. Handler stays platform-agnostic (see §9 channel-routing rule), so Discord is ~an afternoon to add later. **Telegram only** for now.
- **FTS5 / LIKE recall** — semantic (Vectorize) chosen for real recall quality.
- **Rigid 4-bucket classification** — agentic loop subsumes it; memory typed by originating tool.
- **Fiber that "suspends across the confirm wait"** — replaced by pending-row + idempotent execution fiber (the correct primitive usage).
- **External job queue (BullMQ / Redis)** — incompatible with the Workers runtime (needs Redis + a long-running worker process; Workers have neither). And unneeded: reminders are a *scheduler* job (`this.schedule` → DO alarms) and confirm-execution is a single idempotent side-effect (fiber). Queues solve throughput/fan-out/DLQ at scale, which a single-user assistant doesn't have. If scale ever demanded a queue, the native answer is **Cloudflare Queues**, not BullMQ.

---

## 17. Risks / open questions

- **`@cloudflare/voice` is beta (~0.2.x)** — pin; expect churn. Voice streaming over DO RPC works (ReadableStream) but verify end-to-end latency; fallback = buffered text reply.
- **Vercel Chat SDK state on Workers** — must persist across isolates; wire `state: createChatSdkState({ agent: env.ChatSdkStateAgent })` and verify locks/dedupe behave.
- **64-byte Telegram `callback_data`** — keep `batch_id`/action ids short (counter or short ulid).
- **Tool-calling reliability** — verify `runWithTools` (ai-utils) reliably bundles multiple proposals with llama-3.3-70b; tune the system prompt + `maxRecursiveToolRuns`. For Plan 2 voice streaming, use `runWithTools`'s `streamFinalResponse`.
- **Google token** — cache access token, handle 401 refresh; `nodejs_compat` is on for the Agents SDK but Calendar uses raw fetch regardless.
- **Timezone** — store `USER_TZ`; resolve all NL times to absolute before scheduling.
- **Vectorize insert lag** — a few seconds before a new memory is queryable.
- **Verify before coding** (SDKs move fast): exact `withVoice`/`useVoiceAgent` option names, Chat SDK Card/Button JSX import path, `this.schedule` overloads — all confirmed as of 2026-05-29 but re-check at build time.
```
