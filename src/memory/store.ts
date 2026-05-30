import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { memory, NewMemory } from "./schema";


export class MemoryStore {
  constructor(private db: DrizzleSqliteDODatabase<Record<string, never>>) { }

  insert(m: NewMemory): void {
    this.db.insert(memory).values({
      id: m.id,
      kind: m.kind,
      text: m.text,
      channel: m.channel,
      extracted: m.extracted ? JSON.stringify(m.extracted) : null,
      createdAt: m.createdAt ?? Date.now(),
      embedded: 0,
    }).run();
  }

  markEmbedded(id: string): void {
    this.db.update(memory).set({ embedded: 1 }).where(eq(memory.id, id)).run();
  }

  getById(id: string) {
    return this.db.select().from(memory).where(eq(memory.id, id)).get();
  }

  recent(limit: number) {
    return this.db.select().from(memory).orderBy(memory.seq).limit(limit).all();
  }
}
