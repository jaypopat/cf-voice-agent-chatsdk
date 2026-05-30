# Voice-to-Action Assistant

A single-user personal assistant you **talk to** (browser voice) and **reach** (Telegram) that **remembers everything** (semantic memory) and **takes real actions** (Google Calendar + reminders) behind a one-tap cross-channel confirm gate. Built entirely on Cloudflare — one durable "brain" per user, addressed by both ingress channels.

It's a **personal agent you own** — the same genre as self-hosted assistants like [OpenClaw](https://github.com/openclaw/openclaw) (the open-source agent that wires your messaging apps to an AI that remembers everything and pings you proactively). The difference is the shape: this one is **voice-first** and runs **serverless on Cloudflare's edge** (Durable Objects, not a long-running box you babysit), deliberately scoped to one person and a tight calendar/reminders action set rather than a broad do-anything runtime.

> Speak at your desk: _"Schedule a dentist appointment Thursday afternoon, and remind me to bring my insurance card."_ → your phone buzzes on Telegram with **📅 Dentist · ⏰ Bring insurance card · [Confirm] [Change]** → one tap → booked. Thursday at 1pm: _"⏰ Bring your insurance card."_

## Architecture

Four Durable Objects. The **brain** is a single `AssistantAgent` ("main") that owns memory, the agentic loop, actions, and the confirm gate. Voice and Telegram are thin ingress that call it over DO RPC; the brain pushes confirms and reminders back out through Telegram.

```
VoiceAgent      (browser voice) ─┐
                                 ├──▶ AssistantAgent "main" ──▶ Telegram (confirm cards, reminders)
MessengerAgent  (Telegram)      ─┘         the brain
```

`ChatSdkStateAgent` is a fourth DO that persists the Chat SDK's state. Three ideas drive the design:

- **Memory is the substrate.** Every turn and action is embedded; recall is semantic and the model cites memory ids `[id]`.
- **Confirm before mutate, cross-channel.** Action tools only write `pending_action` rows; a turn's proposals bundle into one Telegram confirm card, and a tap executes them in **idempotent fibers** (exactly-once across eviction/retry).
- **Reminders** are Durable Object alarms pushed to Telegram when they fire.

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
