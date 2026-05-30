import { desc, eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { memory } from "./schema";

export interface NewMemory {
  id: string;
  kind: "turn" | "note" | "event" | "reminder";
  text: string;
  channel: "voice" | "telegram" | "system";
  extracted?: Record<string, unknown>;
  created_at?: number;
}


export class MemoryStore {
  constructor(private db: DrizzleSqliteDODatabase) { }

  insert(m: NewMemory): void {
    this.db.insert(memory).values({
      id: m.id,
      kind: m.kind,
      text: m.text,
      channel: m.channel,
      extracted: m.extracted ? JSON.stringify(m.extracted) : null,
      createdAt: m.created_at ?? Date.now(),
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
    return this.db.select().from(memory).orderBy(desc(memory.seq)).limit(limit).all();
  }
}
