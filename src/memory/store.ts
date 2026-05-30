import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { memory } from "./schema";

export interface NewMemory {
  channel?: string; // free-form source tag; real channels arrive with the voice/Telegram ingress
  created_at?: number;
  extracted?: Record<string, unknown>;
  id: string;
  kind: "turn" | "note" | "event" | "reminder";
  text: string;
}

export class MemoryStore {
  constructor(private readonly db: DrizzleSqliteDODatabase) {}

  insert(m: NewMemory): void {
    this.db
      .insert(memory)
      .values({
        id: m.id,
        kind: m.kind,
        text: m.text,
        channel: m.channel ?? "system",
        extracted: m.extracted ? JSON.stringify(m.extracted) : null,
        createdAt: m.created_at ?? Date.now(),
        embedded: 0,
      })
      .run();
  }

  markEmbedded(id: string): void {
    this.db.update(memory).set({ embedded: 1 }).where(eq(memory.id, id)).run();
  }

  getById(id: string) {
    return this.db.select().from(memory).where(eq(memory.id, id)).get();
  }
}
