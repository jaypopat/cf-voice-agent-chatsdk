import { Agent } from "agents";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import migrations from "../../drizzle/migrations";
import { MemoryStore } from "../memory/store";
import { VectorIndex } from "../memory/vector";
import { processTurn } from "../brain/turn";
import { MODELS } from "../config";

export class AssistantAgent extends Agent<Env> {
  protected db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { logger: false });
    ctx.blockConcurrencyWhile(() => migrate(this.db, migrations));
  }

  getMemoryStore(): MemoryStore {
    return new MemoryStore(this.db);
  }

  async handleTurn(text: string): Promise<string> {
    return processTurn(
      {
        ai: this.env.AI,
        model: MODELS.llm,
        store: this.getMemoryStore(),
        vector: new VectorIndex(this.env.AI, this.env.VECTORIZE, MODELS.embed),
      },
      text,
    );
  }
}
