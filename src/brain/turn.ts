import type { PendingStore } from "../actions/pending";
import { shortId } from "../ids";
import type { MemoryStore } from "../memory/store";
import type { VectorIndex } from "../memory/vector";
import { type RunTurnArgs, runTurn, streamTurn } from "./loop";
import { buildSystemPrompt } from "./prompt";
import { makeTools } from "./tools";

const MAX_STEPS = 8;

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

export interface StreamTurnResult {
  batchId: string;
  stream: ReadableStream<Uint8Array>;
}

/**
 * Persist the turn, best-effort embed it, and assemble the loop arguments shared
 * by the buffered and streaming paths. Any actions the model proposes during the
 * loop land under the returned `batchId` for the confirm gate.
 */
async function beginTurn(
  deps: TurnDeps,
  text: string
): Promise<{ args: RunTurnArgs; batchId: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();

  deps.store.insert({ id, kind: "turn", text, created_at: now });
  try {
    await deps.vector.upsertMemory({ id, text, kind: "turn", created_at: now });
    deps.store.markEmbedded(id);
  } catch {
    // embedding lag/failure must never block the reply
  }

  const batchId = shortId();
  const tools = makeTools({
    vector: deps.vector,
    store: deps.store,
    pending: deps.pending,
    batchId,
  });
  return {
    batchId,
    args: {
      ai: deps.ai,
      model: deps.model,
      system: buildSystemPrompt({
        now: new Date(now).toISOString(),
        tz: deps.tz,
      }),
      userText: text,
      tools,
      maxSteps: MAX_STEPS,
    },
  };
}

/** One conversational turn, buffered (Telegram). Pure orchestration — testable without a DO. */
export async function processTurn(
  deps: TurnDeps,
  text: string
): Promise<TurnResult> {
  const { args, batchId } = await beginTurn(deps, text);
  const reply = await runTurn(args);
  return { reply, batchId };
}

/**
 * One conversational turn, streamed (voice). Tool calls finish before the promise
 * resolves, so `batchId`'s proposals are already persisted; only the final reply
 * streams, so the caller can push the confirm card before the first token speaks.
 */
export async function processTurnStreaming(
  deps: TurnDeps,
  text: string
): Promise<StreamTurnResult> {
  const { args, batchId } = await beginTurn(deps, text);
  const stream = await streamTurn(args);
  return { stream, batchId };
}
