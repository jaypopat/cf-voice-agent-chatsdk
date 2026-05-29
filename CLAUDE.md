# cf-voice-agent-chatsdk

A single-user **voice-to-action assistant** built on **Cloudflare Workers / Agents SDK**. You talk to it (browser voice + Telegram), it remembers everything (semantic memory), and it takes real actions (Google Calendar + reminders) behind a one-tap confirm gate.

- **Spec:** `docs/superpowers/specs/2026-05-29-cf-voice-chat-agent-design.md`
- **Plans:** `docs/superpowers/plans/` (Plan 1 = foundation: the brain)

## Runtime: this is Cloudflare Workers, NOT a Bun server

The app runs in Cloudflare's **`workerd`** runtime. Durable Objects, Workers AI, and Vectorize only exist there — they cannot run under Bun or Node. So:

- **Do NOT use `Bun.serve()`, `bun:sqlite`, `Bun.redis`, `Bun.sql`, or HTML-import bundling.** The entrypoint is a Workers `fetch` handler via `routeAgentRequest` (Agents SDK); state is Durable Object SQLite (`this.sql`); there is no Bun runtime in production.
- **Dev/deploy is `wrangler`**, not `bun --hot`. Use `bunx wrangler dev` / `bunx wrangler deploy`. Vectorize + Workers AI have no local simulation — use `bunx wrangler dev --remote` to exercise them.

## Bun is the package manager + script runner (only)

- `bun install` instead of `npm/yarn/pnpm install`
- `bun run <script>` instead of `npm run <script>`
- `bunx <pkg>` instead of `npx <pkg>` (e.g. `bunx wrangler ...`, `bunx vitest ...`)

## Testing: Vitest + `@cloudflare/vitest-pool-workers`

`bun test` **cannot** instantiate Durable Objects or Workers AI / Vectorize bindings — they require the workerd runtime. So tests run on **Vitest** through `@cloudflare/vitest-pool-workers` (which runs tests *inside* workerd), invoked via Bun:

- Run all tests: `bun run test` (script = `vitest run`)
- Run a subset: `bunx vitest run <pattern>`
- DO tests use `cloudflare:test` helpers: `import { env, runInDurableObject } from "cloudflare:test"`.
- Workers AI / Vectorize have no local sim — **mock them in unit tests**; verify the real path with `wrangler dev --remote` (costs Neurons).

## Conventions

- **Idiomatic Cloudflare first.** Before writing Agents-SDK / Workers code, consult the Cloudflare docs MCP (`search_cloudflare_documentation`) — the SDKs move fast and pre-trained knowledge is often stale. Prefer documented APIs over guesses.
- **Agents SDK:** `Agent` base class; address instances via `getAgentByName(env.X, name)`; agent→agent calls are plain Durable Object RPC; per-instance SQLite via `this.sql`; scheduling via `this.schedule(Date, "method", payload)`; durable side-effects via fibers (`startFiber` + `idempotencyKey`).
- **LLM loop:** Vercel AI SDK v6 (`ai`) via `workers-ai-provider`. Note v6 uses `inputSchema` (not `parameters`) in `tool()`, and `stopWhen: stepCountIs(n)` to bound tool-use loops.
- **Models are config-driven** (`src/config.ts`, dev/prod profiles) — never hardcode model ids in logic. Dev profile stays in the Workers AI free tier.
- **TDD + frequent commits.** Write the failing test first; commit per task.

## wrangler bindings (see `wrangler.jsonc`)

`AI` (Workers AI), `VECTORIZE` (semantic memory), Durable Object classes (`AssistantAgent`, plus `VoiceAgent` / `MessengerAgent` / `ChatSdkStateAgent` added in later plans), each registered in a `migrations` `new_sqlite_classes` entry.
