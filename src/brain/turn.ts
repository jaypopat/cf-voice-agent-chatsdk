import type { MemoryStore } from "../memory/store";
import type { VectorIndex } from "../memory/vector";
import { makeTools } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { runTurn } from "./loop";

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
  turn: { text: string; channel: "voice" | "telegram" },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();

  deps.store.insert({ id, kind: "turn", text: turn.text, channel: turn.channel, created_at: now });
  try {
    await deps.vector.upsertMemory({ id, text: turn.text, kind: "turn", created_at: now });
    deps.store.markEmbedded(id);
  } catch {
    // embedding lag/failure must never block the reply
  }

  const tools = makeTools({ vector: deps.vector, store: deps.store, channel: turn.channel });
  return runTurn({
    ai: deps.ai,
    model: deps.model,
    system: buildSystemPrompt(turn.channel),
    userText: turn.text,
    tools,
    maxSteps: 8,
  });
}
