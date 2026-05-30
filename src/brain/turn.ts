import type { PendingStore } from "../actions/pending";
import type { MemoryStore } from "../memory/store";
import type { VectorIndex } from "../memory/vector";
import { runTurn } from "./loop";
import { buildSystemPrompt } from "./prompt";
import { makeTools } from "./tools";

const BATCH_ID_LEN = 8;

export interface TurnDeps {
  ai: Ai;
  model: string;
  pending: PendingStore;
  store: MemoryStore;
  /** IANA timezone for resolving relative times (env.USER_TZ). */
  tz: string;
  vector: VectorIndex;
}

export interface TurnResult {
  /** Groups any actions the model proposed this turn, for the confirm gate. */
  batchId: string;
  reply: string;
}

/**
 * One conversational turn: persist it to memory, best-effort embed it, then run
 * the agentic loop. Pure orchestration — all I/O is injected, so it's testable
 * without a Durable Object or live Workers AI. Any actions the model proposes
 * land under `batchId` in the pending_action table for the confirm gate.
 */
export async function processTurn(
  deps: TurnDeps,
  text: string
): Promise<TurnResult> {
  const id = crypto.randomUUID();
  const now = Date.now();

  deps.store.insert({ id, kind: "turn", text, created_at: now });
  try {
    await deps.vector.upsertMemory({ id, text, kind: "turn", created_at: now });
    deps.store.markEmbedded(id);
  } catch {
    // embedding lag/failure must never block the reply
  }

  const batchId = crypto.randomUUID().slice(0, BATCH_ID_LEN);
  const tools = makeTools({
    vector: deps.vector,
    store: deps.store,
    pending: deps.pending,
    batchId,
  });
  const reply = await runTurn({
    ai: deps.ai,
    model: deps.model,
    system: buildSystemPrompt({
      now: new Date(now).toISOString(),
      tz: deps.tz,
    }),
    userText: text,
    tools,
    maxSteps: 8,
  });
  return { reply, batchId };
}
