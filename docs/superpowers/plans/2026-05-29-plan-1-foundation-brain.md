# Plan 1 — Foundation: The Brain (memory + agentic loop)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `AssistantAgent` Durable Object — a per-user "brain" that stores every turn in SQLite, embeds it into Vectorize, and runs an agentic tool-use loop (`search_memory`, `save_note`) so you can talk to it (via RPC) and it answers from memory with citations.

**Architecture:** A single Cloudflare Agent (SQLite-backed Durable Object) addressed by a constant name `"main"`. The agentic loop uses Vercel AI SDK v6 `generateText` + `tool()` over Workers AI (`workers-ai-provider`). Memory = SQLite (source of truth) + Vectorize (semantic index). Models are selected by a config profile (dev/prod) so dev stays in the free tier.

**Tech Stack:** TypeScript, `agents` (Cloudflare Agents SDK), `ai` (AI SDK v6), `workers-ai-provider`, `zod`, Vectorize + Workers AI bindings, Vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-05-29-cf-voice-chat-agent-design.md` (§5 brain, §6 memory, §11 data model, §12 models).

**Revisions (2026-05-29, mid-execution):**
- **No model profiles** — `src/config.ts` exports a single `MODELS` constant (the cheap/free set); no dev/prod switch, no `MODEL_PROFILE` var. (Task 1 below shows the old profile version — superseded.)
- **Drizzle, not raw SQL** — persistence uses `drizzle-orm/durable-sqlite` (schema in `src/memory/schema.ts`, Drizzle query builder). The raw-SQL code in Task 2 below is superseded by the Drizzle implementation; Task 7's agent uses `MODELS` directly + the Drizzle db.

---

## Plan roadmap (this is Plan 1 of 6)

1. **Foundation — the brain (memory + agentic loop)** ← this plan. Deliverable: an `AssistantAgent` you can call via RPC that captures, recalls, and cites.
2. **Browser voice** — `VoiceAgent` (`withVoice`) + `web/` `useVoiceAgent` → `brain.streamReply` spoken. Deliverable: talk to it in a browser.
3. **Telegram** — `MessengerAgent` (Vercel Chat SDK) text → brain; `ChatSdkStateAgent`. Deliverable: one brain, two channels.
4. **Actions** — `actions/calendar.ts` (Google Calendar REST) + `propose_event`/`propose_reminder` tools + `pending_action` store.
5. **Confirm gate + reminders** — Telegram confirm Cards + `onAction` + idempotent exec fibers + `this.schedule` reminders + push.
6. **Polish** — web UI, timezone/error handling, the demo path.

Each plan is written in full detail just before it is executed, against the real interfaces from the prior plan.

---

## File structure (this plan)

- `package.json` — deps + scripts
- `wrangler.jsonc` — bindings (AI, VECTORIZE, AssistantAgent DO), migration tag `v1`
- `tsconfig.json`, `worker-configuration.d.ts` (generated), `vitest.config.ts`
- `.gitignore`
- `src/config.ts` — model-profile resolution (dev/prod) — **pure, unit-tested**
- `src/memory/store.ts` — SQLite memory CRUD over an Agent's `this.sql` — **DO-tested**
- `src/memory/vector.ts` — embed + Vectorize upsert/query — **unit-tested with fakes**
- `src/brain/prompt.ts` — system prompt builder — **pure, unit-tested**
- `src/brain/tools.ts` — `search_memory`, `save_note` tool factories — **unit-tested**
- `src/brain/loop.ts` — `runTurn()` agentic loop (generateText + tools) — **tested with a mock model**
- `src/agents/AssistantAgent.ts` — the DO: `handleTurn(text)` RPC — **DO integration-tested**
- `src/index.ts` — Worker entry (`routeAgentRequest`)
- `test/*` — Vitest tests

---

## Task 0: Project scaffolding

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`, `test/smoke.test.ts`

- [ ] **Step 1: Initialize git + npm**

```bash
cd /home/jay/Dev/cf-voice-agent-chatsdk
git init
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install agents ai workers-ai-provider zod
npm install -D wrangler typescript vitest @cloudflare/vitest-pool-workers @cloudflare/workers-types
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
.wrangler/
.dev.vars
worker-configuration.d.ts
.DS_Store
```

- [ ] **Step 4: Write `wrangler.jsonc`**

```jsonc
{
  "name": "voice-assistant",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-29",
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "assistant-memory" }],
  "durable_objects": {
    "bindings": [{ "name": "AssistantAgent", "class_name": "AssistantAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AssistantAgent"] }],
  "vars": { "MODEL_PROFILE": "dev" }
}
```

- [ ] **Step 5: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["src", "test", "worker-configuration.d.ts"]
}
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Vectorize + Workers AI have no local simulation; tests mock them.
          compatibilityFlags: ["nodejs_compat"],
        },
      },
    },
  },
});
```

- [ ] **Step 7: Write a minimal `src/index.ts`**

```ts
import { routeAgentRequest } from "agents";

export { AssistantAgent } from "./agents/AssistantAgent";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

> Note: `src/index.ts` imports `AssistantAgent` (created in Task 6). Until then, comment out the export line or expect a type error. The smoke test below does not import it.

- [ ] **Step 8: Write `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Add scripts to `package.json`**

Set the `"scripts"` field to:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc",
    "types": "wrangler types",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

- [ ] **Step 10: Generate binding types**

Run: `npm run types`
Expected: creates `worker-configuration.d.ts` with an `Env` interface containing `AI`, `VECTORIZE`, `AssistantAgent`, `MODEL_PROFILE`.

- [ ] **Step 11: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test). If the pool fails to start, verify `@cloudflare/vitest-pool-workers` version matches `wrangler`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Cloudflare Agents project with vitest-pool-workers"
```

---

## Task 1: Model-profile config

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/config.test.ts
import { describe, it, expect } from "vitest";
import { resolveModels } from "../src/config";

describe("resolveModels", () => {
  it("returns dev models for the dev profile", () => {
    const m = resolveModels("dev");
    expect(m.llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(m.tts).toBe("@cf/myshell-ai/melotts");
    expect(m.embed).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });

  it("returns prod models for the prod profile", () => {
    const m = resolveModels("prod");
    expect(m.llm).toBe("@cf/moonshotai/kimi-k2.6");
    expect(m.tts).toBe("@cf/deepgram/aura-1");
  });

  it("defaults to dev for unknown/empty", () => {
    expect(resolveModels(undefined).llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config`
Expected: FAIL ("Cannot find module '../src/config'").

- [ ] **Step 3: Write `src/config.ts`**

```ts
export type ModelProfile = "dev" | "prod";

export interface Models {
  llm: string;
  stt: string;
  tts: string;
  embed: string;
}

const PROFILES: Record<ModelProfile, Models> = {
  dev: {
    llm: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    stt: "@cf/deepgram/flux",
    tts: "@cf/myshell-ai/melotts",
    embed: "@cf/qwen/qwen3-embedding-0.6b",
  },
  prod: {
    llm: "@cf/moonshotai/kimi-k2.6",
    stt: "@cf/deepgram/flux",
    tts: "@cf/deepgram/aura-1",
    embed: "@cf/qwen/qwen3-embedding-0.6b",
  },
};

export const EMBED_DIM = 1024; // qwen3-embedding-0.6b

export function resolveModels(profile: string | undefined): Models {
  return profile === "prod" ? PROFILES.prod : PROFILES.dev;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: model-profile config (dev/prod)"
```

---

## Task 2: Memory store (SQLite)

The store operates on an Agent's synchronous `this.sql` tagged template. We test it through a real `AssistantAgent` DO instance using `runInDurableObject` from the workers test pool, so we exercise actual SQLite.

**Files:**
- Create: `src/memory/store.ts`
- Create (stub for testing): `src/agents/AssistantAgent.ts` (minimal; fleshed out in Task 6)
- Test: `test/memory-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/memory-store.test.ts
import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { getMemoryStoreFor } from "./helpers/memory-harness";

describe("MemoryStore", () => {
  it("inserts and lists memory rows in insertion order", async () => {
    const id = env.AssistantAgent.idFromName("test-mem");
    const stub = env.AssistantAgent.get(id);
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "m1", kind: "note", text: "buy milk", channel: "telegram" });
      store.insert({ id: "m2", kind: "turn", text: "hello", channel: "voice" });
      const rows = store.recent(10);
      expect(rows.map((r) => r.id)).toEqual(["m1", "m2"]);
      expect(rows[0].text).toBe("buy milk");
    });
  });

  it("getById returns a single row or undefined", async () => {
    const id = env.AssistantAgent.idFromName("test-mem2");
    const stub = env.AssistantAgent.get(id);
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "x1", kind: "note", text: "abc", channel: "system" });
      expect(store.getById("x1")?.text).toBe("abc");
      expect(store.getById("nope")).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Write the test harness helper**

```ts
// test/helpers/memory-harness.ts
import { MemoryStore } from "../../src/memory/store";

// instance is the AssistantAgent; this.sql is accessible inside the DO.
export function getMemoryStoreFor(instance: any): MemoryStore {
  instance.ensureSchema?.();
  return new MemoryStore(instance.sql.bind(instance));
}
```

- [ ] **Step 3: Write a minimal `src/agents/AssistantAgent.ts` for testing**

```ts
import { Agent } from "agents";
import { MEMORY_SCHEMA } from "../memory/store";

export class AssistantAgent extends Agent<Env> {
  ensureSchema() {
    this.sql(MEMORY_SCHEMA as unknown as TemplateStringsArray);
  }
}
```

> The Agents SDK `this.sql` is a tagged-template function. For raw DDL we pass a single-element array. If the SDK exposes `this.ctx.storage.sql.exec`, prefer that for DDL (see Step 4 note).

- [ ] **Step 4: Write `src/memory/store.ts`**

```ts
export const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS memory (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,      -- turn | note | event | reminder
  text        TEXT NOT NULL,
  extracted   TEXT,               -- json
  channel     TEXT NOT NULL,      -- voice | telegram | system
  created_at  INTEGER NOT NULL,
  embedded    INTEGER NOT NULL DEFAULT 0
);
`;

export interface MemoryRow {
  id: string;
  kind: "turn" | "note" | "event" | "reminder";
  text: string;
  extracted?: string;
  channel: "voice" | "telegram" | "system";
  created_at: number;
  embedded: number;
}

export interface NewMemory {
  id: string;
  kind: MemoryRow["kind"];
  text: string;
  channel: MemoryRow["channel"];
  extracted?: Record<string, unknown>;
  created_at?: number;
}

// `sql` is the Agent's tagged-template (this.sql). Wrap it for explicit calls.
type Sql = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => T[];

export class MemoryStore {
  constructor(private sql: Sql) {}

  insert(m: NewMemory): void {
    const ts = m.created_at ?? Date.now();
    const extracted = m.extracted ? JSON.stringify(m.extracted) : null;
    this.sql`INSERT INTO memory (id, kind, text, extracted, channel, created_at, embedded)
             VALUES (${m.id}, ${m.kind}, ${m.text}, ${extracted}, ${m.channel}, ${ts}, 0)`;
  }

  markEmbedded(id: string): void {
    this.sql`UPDATE memory SET embedded = 1 WHERE id = ${id}`;
  }

  getById(id: string): MemoryRow | undefined {
    const rows = this.sql<MemoryRow>`SELECT * FROM memory WHERE id = ${id}`;
    return rows[0];
  }

  recent(limit: number): MemoryRow[] {
    return this.sql<MemoryRow>`SELECT * FROM memory ORDER BY created_at ASC LIMIT ${limit}`;
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- memory-store`
Expected: PASS. If `this.sql` DDL fails, switch `ensureSchema()` to `this.ctx.storage.sql.exec(MEMORY_SCHEMA)` and re-run. **Verify the exact `this.sql` DDL idiom against the Agents SDK docs (`store-and-sync-state` / SQL API) before finalizing.**

- [ ] **Step 6: Commit**

```bash
git add src/memory/store.ts src/agents/AssistantAgent.ts test/memory-store.test.ts test/helpers/memory-harness.ts
git commit -m "feat: SQLite memory store"
```

---

## Task 3: Vector layer (embed + Vectorize)

Vectorize has no local simulation, so we unit-test `VectorIndex` against an in-memory fake that implements the methods we call, plus a fake `AI` binding. This verifies our wiring (we pass `vector.data[0]`, store ids/metadata, map query results) without real bindings.

**Files:**
- Create: `src/memory/vector.ts`
- Test: `test/vector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/vector.test.ts
import { describe, it, expect, vi } from "vitest";
import { VectorIndex } from "../src/memory/vector";

function fakeAI(vec: number[]) {
  return { run: vi.fn(async () => ({ shape: [1, vec.length], data: [vec] })) } as any;
}

function fakeVectorize() {
  const store: any[] = [];
  return {
    _store: store,
    insert: vi.fn(async (vs: any[]) => { store.push(...vs); }),
    upsert: vi.fn(async (vs: any[]) => { store.push(...vs); }),
    query: vi.fn(async (_v: number[], opts: any) => ({
      count: Math.min(opts.topK, store.length),
      matches: store.slice(0, opts.topK).map((s) => ({ id: s.id, score: 0.9, metadata: s.metadata })),
    })),
  } as any;
}

describe("VectorIndex", () => {
  it("embeds text and passes data[0] to query", async () => {
    const ai = fakeAI([0.1, 0.2, 0.3]);
    const vz = fakeVectorize();
    const idx = new VectorIndex(ai, vz, "@cf/qwen/qwen3-embedding-0.6b");
    await idx.query("hello", 5);
    expect(ai.run).toHaveBeenCalledWith("@cf/qwen/qwen3-embedding-0.6b", { text: ["hello"] });
    expect(vz.query).toHaveBeenCalledWith([0.1, 0.2, 0.3], expect.objectContaining({ topK: 5, returnMetadata: "all" }));
  });

  it("upserts a memory with id + snippet metadata", async () => {
    const ai = fakeAI([1, 2, 3]);
    const vz = fakeVectorize();
    const idx = new VectorIndex(ai, vz, "@cf/qwen/qwen3-embedding-0.6b");
    await idx.upsertMemory({ id: "m1", text: "buy milk", kind: "note", created_at: 123 });
    expect(vz._store[0].id).toBe("m1");
    expect(vz._store[0].values).toEqual([1, 2, 3]);
    expect(vz._store[0].metadata).toMatchObject({ snippet: "buy milk", kind: "note" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- vector`
Expected: FAIL ("Cannot find module '../src/memory/vector'").

- [ ] **Step 3: Write `src/memory/vector.ts`**

```ts
export interface VectorMatch { id: string; score: number; snippet: string; kind: string; created_at: number; }

interface EmbeddingResponse { shape: number[]; data: number[][]; }

export class VectorIndex {
  constructor(
    private ai: Ai,
    private vz: VectorizeIndex,
    private embedModel: string,
  ) {}

  private async embed(text: string): Promise<number[]> {
    const r = (await this.ai.run(this.embedModel, { text: [text] })) as unknown as EmbeddingResponse;
    return r.data[0];
  }

  async upsertMemory(m: { id: string; text: string; kind: string; created_at: number }): Promise<void> {
    const values = await this.embed(m.text);
    await this.vz.upsert([
      { id: m.id, values, metadata: { snippet: m.text.slice(0, 512), kind: m.kind, created_at: m.created_at } },
    ]);
  }

  async query(text: string, topK: number): Promise<VectorMatch[]> {
    const v = await this.embed(text);
    const res = await this.vz.query(v, { topK, returnMetadata: "all" });
    return res.matches.map((m: any) => ({
      id: m.id,
      score: m.score,
      snippet: String(m.metadata?.snippet ?? ""),
      kind: String(m.metadata?.kind ?? ""),
      created_at: Number(m.metadata?.created_at ?? 0),
    }));
  }
}
```

> Types `Ai` and `VectorizeIndex` come from `@cloudflare/workers-types`. If names differ in the generated `worker-configuration.d.ts`, use those (e.g. `Vectorize`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- vector`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/memory/vector.ts test/vector.test.ts
git commit -m "feat: Vectorize embed/upsert/query layer"
```

---

## Task 4: System prompt builder

**Files:**
- Create: `src/brain/prompt.ts`
- Test: `test/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/brain/prompt";

describe("buildSystemPrompt", () => {
  it("includes the channel and citation instruction", () => {
    const p = buildSystemPrompt("voice");
    expect(p).toMatch(/voice/i);
    expect(p).toMatch(/cite/i);
    expect(p).toMatch(/\[id\]/);
  });

  it("tells voice to keep replies short", () => {
    expect(buildSystemPrompt("voice")).toMatch(/short|concise|brief/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prompt`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/brain/prompt.ts`**

```ts
export function buildSystemPrompt(channel: "voice" | "telegram"): string {
  const brevity =
    channel === "voice"
      ? "You are replying over VOICE. Keep replies short and conversational — one or two sentences."
      : "You are replying over TELEGRAM text. Be concise.";
  return [
    "You are a personal voice-to-action assistant with a long-term memory.",
    brevity,
    "Before answering anything about the user's past, call search_memory to ground your answer.",
    "When you use a remembered fact, cite it inline using its id in square brackets like [id].",
    "Use save_note to remember a fact the user states that is worth keeping.",
    "Never invent calendar events or reminders in this version — those tools do not exist yet; if asked, say you can't do that yet.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- prompt`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/brain/prompt.ts test/prompt.test.ts
git commit -m "feat: system prompt builder"
```

---

## Task 5: Tools (`search_memory`, `save_note`)

Tools are AI SDK v6 `tool()` objects. We build them via a factory that closes over the `VectorIndex` and `MemoryStore` so they're testable in isolation. **Note: AI SDK v6 uses `inputSchema` (not `parameters`).**

**Files:**
- Create: `src/brain/tools.ts`
- Test: `test/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { makeTools } from "../src/brain/tools";

describe("makeTools", () => {
  it("search_memory returns matches from the index", async () => {
    const vector = { query: vi.fn(async () => [{ id: "m1", score: 0.9, snippet: "buy milk", kind: "note", created_at: 1 }]) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = await tools.search_memory.execute({ query: "milk", topK: 5 }, {} as any);
    expect(out.matches[0].id).toBe("m1");
    expect(vector.query).toHaveBeenCalledWith("milk", 5);
  });

  it("save_note inserts to store and upserts to the index", async () => {
    const vector = { upsertMemory: vi.fn(async () => {}) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = await tools.save_note.execute({ text: "remember this" }, {} as any);
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", kind: "note", text: "remember this" }));
    expect(vector.upsertMemory).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", text: "remember this" }));
    expect(out.saved).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tools`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/brain/tools.ts`**

```ts
import { tool } from "ai";
import { z } from "zod";
import type { VectorIndex } from "../memory/vector";
import type { MemoryStore } from "../memory/store";

export interface ToolDeps {
  vector: Pick<VectorIndex, "query" | "upsertMemory">;
  store: Pick<MemoryStore, "insert" | "markEmbedded">;
  newId: () => string;
  channel?: "voice" | "telegram" | "system";
}

export function makeTools(deps: ToolDeps) {
  return {
    search_memory: tool({
      description: "Search the user's long-term memory for relevant past notes, turns, and actions.",
      inputSchema: z.object({
        query: z.string().describe("What to search for"),
        topK: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ query, topK }) => {
        const matches = await deps.vector.query(query, topK);
        return { matches };
      },
    }),
    save_note: tool({
      description: "Persist a fact worth remembering to long-term memory.",
      inputSchema: z.object({
        text: z.string().describe("The fact to remember"),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ text, tags }) => {
        const id = deps.newId();
        const created_at = Date.now();
        deps.store.insert({ id, kind: "note", text, channel: deps.channel ?? "system", extracted: tags ? { tags } : undefined, created_at });
        await deps.vector.upsertMemory({ id, text, kind: "note", created_at });
        deps.store.markEmbedded(id);
        return { saved: true, id };
      },
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tools`
Expected: PASS (2 tests). If `tool().execute` typing complains about the 2nd arg, the test passes `{}` as the tool-call options; adjust the cast if AI SDK v6's signature differs.

- [ ] **Step 5: Commit**

```bash
git add src/brain/tools.ts test/tools.test.ts
git commit -m "feat: search_memory + save_note tools"
```

---

## Task 6: Agentic loop (`runTurn`)

We test the loop with AI SDK's mock model so no Neurons are spent and behavior is deterministic. **Verify the exact `ai/test` import (`MockLanguageModelV2`) and `generateText` result shape against AI SDK v6 docs at execution.**

**Files:**
- Create: `src/brain/loop.ts`
- Test: `test/loop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/loop.test.ts
import { describe, it, expect } from "vitest";
import { MockLanguageModelV2 } from "ai/test";
import { runTurn } from "../src/brain/loop";
import { makeTools } from "../src/brain/tools";

describe("runTurn", () => {
  it("returns the model's final text", async () => {
    const model = new MockLanguageModelV2({
      doGenerate: async () => ({
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        content: [{ type: "text", text: "You have one note: buy milk [m1]." }],
        warnings: [],
      }),
    });
    const vector = { query: async () => [], upsertMemory: async () => {} } as any;
    const store = { insert: () => {}, markEmbedded: () => {} } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const text = await runTurn({ model, system: "sys", userText: "what notes do I have?", tools, maxSteps: 4 });
    expect(text).toContain("buy milk");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- loop`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/brain/loop.ts`**

```ts
import { generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";

export interface RunTurnArgs {
  model: LanguageModel;
  system: string;
  userText: string;
  tools: ToolSet;
  maxSteps?: number;
}

export async function runTurn(args: RunTurnArgs): Promise<string> {
  const { text } = await generateText({
    model: args.model,
    system: args.system,
    prompt: args.userText,
    tools: args.tools,
    stopWhen: stepCountIs(args.maxSteps ?? 8),
  });
  return text;
}
```

> `runTurn` returns the full text (non-streaming). The streaming variant for voice is added in Plan 2; keep this method, add `streamReply` later.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- loop`
Expected: PASS. If `MockLanguageModelV2`'s `content` shape differs in your AI SDK v6 minor, align with the version's test docs.

- [ ] **Step 5: Commit**

```bash
git add src/brain/loop.ts test/loop.test.ts
git commit -m "feat: agentic loop runTurn (generateText + tools)"
```

---

## Task 7: Wire `AssistantAgent.handleTurn`

Replace the testing stub with the real agent: it ensures schema, stores the incoming turn, runs the loop, and returns the reply. Tested as a DO with a **fake AI binding** injected via the agent's `env` (the workers pool lets us override bindings per test, or we stub `this.env.AI`).

**Files:**
- Modify: `src/agents/AssistantAgent.ts`
- Test: `test/assistant-agent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/assistant-agent.test.ts
import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";

describe("AssistantAgent.handleTurn", () => {
  it("stores the user turn and returns a reply", async () => {
    const id = env.AssistantAgent.idFromName("main");
    const stub = env.AssistantAgent.get(id);
    const reply = await runInDurableObject(stub, async (agent: any) => {
      // Inject deterministic deps to avoid real Workers AI / Vectorize.
      agent.__setTestModel({
        doGenerate: async () => ({
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          content: [{ type: "text", text: "Got it." }],
          warnings: [],
        }),
      });
      agent.__setTestVector({ query: async () => [], upsertMemory: async () => {} });
      return await agent.handleTurn({ text: "hello brain", channel: "telegram" });
    });
    expect(reply).toBe("Got it.");

    // The turn was persisted.
    await runInDurableObject(stub, async (agent: any) => {
      const rows = agent.testRecent(10);
      expect(rows.some((r: any) => r.text === "hello brain")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assistant-agent`
Expected: FAIL (methods `handleTurn`/`__setTestModel` missing).

- [ ] **Step 3: Write the full `src/agents/AssistantAgent.ts`**

```ts
import { Agent } from "agents";
import { MockLanguageModelV2 } from "ai/test";
import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel } from "ai";
import { MEMORY_SCHEMA, MemoryStore } from "../memory/store";
import { VectorIndex } from "../memory/vector";
import { makeTools } from "../brain/tools";
import { buildSystemPrompt } from "../brain/prompt";
import { runTurn } from "../brain/loop";
import { resolveModels } from "../config";

export class AssistantAgent extends Agent<Env> {
  private schemaReady = false;
  private testModel?: LanguageModel;
  private testVector?: Pick<VectorIndex, "query" | "upsertMemory">;

  private ensureSchema() {
    if (this.schemaReady) return;
    this.sql(MEMORY_SCHEMA as unknown as TemplateStringsArray);
    this.schemaReady = true;
  }

  private store(): MemoryStore {
    this.ensureSchema();
    return new MemoryStore(this.sql.bind(this) as any);
  }

  private models() {
    return resolveModels(this.env.MODEL_PROFILE);
  }

  private vector(): Pick<VectorIndex, "query" | "upsertMemory"> {
    return this.testVector ?? new VectorIndex(this.env.AI, this.env.VECTORIZE, this.models().embed);
  }

  private model(): LanguageModel {
    if (this.testModel) return this.testModel;
    const workersai = createWorkersAI({ binding: this.env.AI });
    return workersai(this.models().llm);
  }

  async handleTurn(turn: { text: string; channel: "voice" | "telegram" }): Promise<string> {
    const store = this.store();
    const vector = this.vector();

    // Persist + embed the incoming turn.
    const turnId = crypto.randomUUID();
    store.insert({ id: turnId, kind: "turn", text: turn.text, channel: turn.channel, created_at: Date.now() });
    try {
      await (vector as VectorIndex).upsertMemory?.({ id: turnId, text: turn.text, kind: "turn", created_at: Date.now() });
      store.markEmbedded(turnId);
    } catch { /* embedding lag/failure must not block the reply */ }

    const tools = makeTools({ vector, store, newId: () => crypto.randomUUID(), channel: turn.channel });
    return runTurn({
      model: this.model(),
      system: buildSystemPrompt(turn.channel),
      userText: turn.text,
      tools,
      maxSteps: 8,
    });
  }

  // ---- test seams (no-ops in prod paths) ----
  __setTestModel(cfg: ConstructorParameters<typeof MockLanguageModelV2>[0]) { this.testModel = new MockLanguageModelV2(cfg); }
  __setTestVector(v: Pick<VectorIndex, "query" | "upsertMemory">) { this.testVector = v; }
  testRecent(n: number) { return this.store().recent(n); }
}
```

> The `crypto.randomUUID()` is fine here (DO runtime), unlike the workflow sandbox. Replace with a ulid lib later if you want sortable ids.

- [ ] **Step 4: Re-enable the export in `src/index.ts`**

Ensure `src/index.ts` has `export { AssistantAgent } from "./agents/AssistantAgent";` uncommented.

- [ ] **Step 5: Run the test**

Run: `npm test -- assistant-agent`
Expected: PASS. If the workers pool can't reach `this.env.AI` types, run `npm run types` again.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: AssistantAgent.handleTurn wires memory + loop"
```

---

## Task 8: Manual end-to-end verification (real bindings)

This is a runnable verification, not a unit test — it spends a few Neurons and needs a real Vectorize index.

**Files:**
- Create: `test/manual/talk.http` (or use curl)

- [ ] **Step 1: Create the Vectorize index**

Run: `npx wrangler vectorize create assistant-memory --dimensions=1024 --metric=cosine`
Expected: index created. (If it exists, skip.)

- [ ] **Step 2: Start dev with remote bindings for AI + Vectorize**

Run: `npx wrangler dev --remote`
Expected: server on `http://localhost:8787`. (`--remote` because Vectorize/Workers AI have no local sim.)

- [ ] **Step 3: Talk to the brain via the agent route**

The agent is reachable at `/agents/assistant-agent/main`. Send a save then a recall (two calls). Using curl against the default RPC-over-HTTP route or a tiny test endpoint — if `routeAgentRequest` doesn't expose `handleTurn` over HTTP directly, add a temporary `onRequest` to `AssistantAgent` that parses `{text}` and calls `handleTurn`:

```ts
// TEMP in AssistantAgent for manual testing; remove after.
async onRequest(req: Request): Promise<Response> {
  const { text, channel = "telegram" } = await req.json<{ text: string; channel?: "voice" | "telegram" }>();
  return Response.json({ reply: await this.handleTurn({ text, channel }) });
}
```

```bash
curl -s localhost:8787/agents/assistant-agent/main -d '{"text":"Remember that my wifi password is hunter2"}' | jq
curl -s localhost:8787/agents/assistant-agent/main -d '{"text":"what is my wifi password?"}' | jq
```
Expected: second reply recalls "hunter2" and cites an id like `[...]`.

- [ ] **Step 4: Confirm with MODEL_PROFILE=dev it stays cheap**

Verify `wrangler.jsonc` `vars.MODEL_PROFILE` is `"dev"`. Observe the reply uses the llama model (check `wrangler dev` logs / AI dashboard Neuron usage stays small).

- [ ] **Step 5: Remove the temporary `onRequest`** (Plan 2/3 provide the real ingress) and commit.

```bash
git add -A
git commit -m "chore: manual e2e verification of the brain"
```

---

## Self-review (performed against the spec)

- **§5 brain (agentic loop, tools, model profile, citations):** Tasks 4–7 ✓ (streaming `streamReply` deferred to Plan 2, as noted).
- **§6 memory (SQLite + Vectorize, qwen3 1024-dim, store turns/notes):** Tasks 2, 3, 7 ✓.
- **§11 data model (`memory` table):** Task 2 ✓ (`pending_action`/`reminder` tables belong to Plans 4–5).
- **§12 models (dev/prod profiles):** Task 1 ✓.
- **Out of this plan (correctly deferred):** voice (Plan 2), Telegram + `ChatSdkStateAgent` (Plan 3), actions/calendar (Plan 4), confirm + reminders (Plan 5). The `wrangler.jsonc` migration here lists only `AssistantAgent`; later plans add new migration tags.
- **Placeholder scan:** none — every step has concrete code/commands. Three explicit "verify against docs at execution" notes flag genuinely version-sensitive APIs (`this.sql` DDL idiom, `ai/test` mock shape, AI SDK `tool().execute` signature), not missing content.
- **Type consistency:** `MemoryStore` (insert/markEmbedded/getById/recent), `VectorIndex` (query/upsertMemory), `makeTools({vector,store,newId,channel})`, `runTurn({model,system,userText,tools,maxSteps})`, `resolveModels(profile)` — names match across Tasks 1–7.

**Known risk:** the Agents SDK `this.sql` tagged-template-vs-DDL idiom is the most likely first snag (Step 5 of Task 2 gives the `this.ctx.storage.sql.exec` fallback). Everything else is covered by mocked unit tests before the real-binding e2e in Task 8.
