import { Agent } from "agents";
import { MEMORY_SCHEMA, MemoryStore } from "../memory/store";

export class AssistantAgent extends Agent<Env> {
  private schemaReady = false;

  ensureSchema(): void {
    if (this.schemaReady) return;
    this.sql`${MEMORY_SCHEMA as unknown as TemplateStringsArray}`;
    // this.sql tagged template can't take a plain string — use ctx.storage.sql.exec for raw DDL
    this.ctx.storage.sql.exec(MEMORY_SCHEMA);
    this.schemaReady = true;
  }

  getMemoryStore(): MemoryStore {
    this.ensureSchema();
    return new MemoryStore(this.sql.bind(this));
  }
}
