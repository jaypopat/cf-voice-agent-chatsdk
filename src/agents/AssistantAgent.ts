import { Agent } from "agents";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import migrations from "../../drizzle/migrations";
import { MemoryStore } from "../memory/store";

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
}
