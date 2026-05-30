import { Agent } from "agents";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import migrations from "../../drizzle/migrations";
import { MemoryStore } from "../memory/store";
import { VectorIndex } from "../memory/vector";
import { makeTools } from "../brain/tools";
import { buildSystemPrompt } from "../brain/prompt";
import { runTurn } from "../brain/loop";
import { MODELS } from "../config";

export class AssistantAgent extends Agent<Env> {
  protected db: DrizzleSqliteDODatabase;

  private testAI?: Ai;
  private testVector?: Pick<VectorIndex, "query" | "upsertMemory">;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { logger: false });
    ctx.blockConcurrencyWhile(() => migrate(this.db, migrations));
  }

  getMemoryStore(): MemoryStore {
    return new MemoryStore(this.db);
  }

  private vector(): Pick<VectorIndex, "query" | "upsertMemory"> {
    return this.testVector ?? new VectorIndex(this.env.AI, this.env.VECTORIZE, MODELS.embed);
  }

  private ai(): Ai {
    return this.testAI ?? this.env.AI;
  }

  async handleTurn(turn: { text: string; channel: "voice" | "telegram" }): Promise<string> {
    const store = this.getMemoryStore();
    const vector = this.vector();
    const turnId = crypto.randomUUID();
    const now = Date.now();
    store.insert({ id: turnId, kind: "turn", text: turn.text, channel: turn.channel, created_at: now });
    try {
      await vector.upsertMemory({ id: turnId, text: turn.text, kind: "turn", created_at: now });
      store.markEmbedded(turnId);
    } catch {
      // embedding lag/failure must never block the reply
    }
    const tools = makeTools({ vector, store, newId: () => crypto.randomUUID(), channel: turn.channel });
    return runTurn({
      ai: this.ai(),
      model: MODELS.llm,
      system: buildSystemPrompt(turn.channel),
      userText: turn.text,
      tools,
      maxSteps: 8,
    });
  }

  // ---- test seams (used only by tests) ----
  __setTestAI(ai: Ai) { this.testAI = ai; }
  __setTestVector(v: Pick<VectorIndex, "query" | "upsertMemory">) { this.testVector = v; }
  testRecent(n: number) { return this.getMemoryStore().recent(n); }
}
