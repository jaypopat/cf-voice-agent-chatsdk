# Voice-to-Action Assistant

A single-user personal assistant you **talk to** (browser voice) and **reach** (Telegram) that **remembers everything** (semantic memory) and **takes real actions** (Google Calendar + reminders) behind a one-tap cross-channel confirm gate. Built entirely on Cloudflare — one durable "brain" per user, addressed by both ingress channels.

> Speak at your desk: _"Schedule a dentist appointment Thursday afternoon, and remind me to bring my insurance card."_ → your phone buzzes on Telegram with **📅 Dentist · ⏰ Bring insurance card · [Confirm] [Change]** → one tap → booked. Thursday at 1pm: _"⏰ Bring your insurance card."_

## Architecture

Four Durable Objects (Agents SDK). The **brain** is a single `AssistantAgent` instance named `"main"`; voice and Telegram are thin ingress skins over it.

```
Browser mic ──WS──▶ VoiceAgent ─┐                Telegram ──webhook──▶ MessengerAgent ─┐
 (useVoiceAgent)  withVoice:     │ DO RPC          (Chat SDK) onDirectMessage,         │ DO RPC
                  Flux STT/Aura  │                 onAction(confirm), notify()         │
                  TTS, onTurn    ▼                                                      ▼
              ┌──────────────── AssistantAgent ("main") — THE BRAIN ───────────────────────┐
              │ agentic loop: @cloudflare/ai-utils runWithTools + llama-3.3-70b            │
              │ tools: search_memory · save_note · propose_event · propose_reminder         │
              │ memory: Drizzle SQLite (records) + Vectorize (qwen3-embedding-0.6b)          │
              │ actions: Google Calendar REST · reminders via this.schedule()               │
              │ confirm gate: pending_action rows → confirmBatch() → idempotent exec fibers  │
              └──────────────────────────────────────────────────────────────────────────────┘
                          ChatSdkStateAgent ← persists Chat SDK locks/queues (sub-agent)
```

- **Memory is the substrate.** Every turn/note/action is stored and embedded; recall is semantic (`search_memory`), and the model cites memory ids `[id]`.
- **Confirm before mutate, cross-channel.** `propose_*` tools never touch the outside world — they write `pending_action` rows. A turn's proposals bundle into one Telegram confirm card; a tap runs `confirmBatch`, which executes each action in an **idempotent fiber** (exactly-once across eviction/retry) and pushes a receipt.
- **Reminders** are Durable Object alarms (`this.schedule(date, "fireReminder", …)`) pushed to Telegram when they fire.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Cloudflare Workers (`workerd`) — Durable Objects, Workers AI, Vectorize |
| Agents | `agents` SDK (`Agent`, `getAgentByName`, `this.schedule`, fibers) |
| Voice | `@cloudflare/voice` (`withVoice`, Flux STT, Aura TTS, `useVoiceAgent`) — **beta (~0.2)** |
| Telegram | Vercel **Chat SDK** (`chat`) + `@chat-adapter/telegram`, state via `agents/chat-sdk` |
| LLM loop | `@cloudflare/ai-utils` `runWithTools` (CF-native function calling) |
| Persistence | Drizzle ORM over Durable Object SQLite |
| Web UI | Vite + React (`web/`), served via Workers static assets |
| Package manager / tests / lint | Bun · Vitest (`@cloudflare/vitest-pool-workers`) · ultracite/biome |

Models live only in `src/config.ts` (`MODELS`) — swapping is a one-line change. The set is free-tier-friendly (Workers AI gives 10k Neurons/day free).

## Develop

```bash
bun install
bun run build:web        # build the voice UI into web/dist (the Worker serves it)
bun run typecheck        # tsc
bun run test             # vitest (runs inside workerd)
bun run check            # ultracite/biome lint
bunx wrangler dev --remote   # exercise Workers AI + Vectorize (no local sim)
```

**Setup (secrets, Vectorize index, Telegram bot, Google OAuth, deploy) → [SETUP.md](./SETUP.md).** The app needs those before it does anything.

## Scope

**In:** browser voice conversation, Telegram capture/recall/confirm, agentic brain, semantic memory, Google Calendar create, one-off reminders, cross-channel confirm gate.

**Out (deliberately):** telephony / phone calls, email & messaging actions, multi-tenant signup/billing, Discord/Slack (the handler is platform-agnostic, so adding one later is cheap), daily digests / routine learning.
