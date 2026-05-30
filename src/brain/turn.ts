import type { MemoryStore } from "../memory/store";
import type { VectorIndex } from "../memory/vector";
import { runTurn } from "./loop";
import { buildSystemPrompt } from "./prompt";
import { makeTools } from "./tools";

export interface TurnDeps {
  ai: Ai;
  model: string;
  store: MemoryStore;
  vector: VectorIndex;
}

/**
 * One conversational turn: persist it to memory, best-effort embed it, then run
 * the agentic loop and return the reply. Pure orchestration — all I/O is injected,
 * so it's testable without a Durable Object or live Workers AI.
 */
export async function processTurn(
  deps: TurnDeps,
  text: string
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();

  deps.store.insert({ id, kind: "turn", text, created_at: now });
  try {
    await deps.vector.upsertMemory({ id, text, kind: "turn", created_at: now });
    deps.store.markEmbedded(id);
  } catch {
    // embedding lag/failure must never block the reply
  }

  const tools = makeTools({ vector: deps.vector, store: deps.store });
  return runTurn({
    ai: deps.ai,
    model: deps.model,
    system: buildSystemPrompt(),
    userText: text,
    tools,
    maxSteps: 8,
  });
}
