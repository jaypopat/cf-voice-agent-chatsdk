import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { MemoryStore } from "../../src/memory/store";

// The brain's Drizzle db is private; tests reach it by structural cast (the same
// approach as pending.test.ts) so we don't widen the agent's surface for tests.
export function getMemoryStoreFor(instance: unknown): MemoryStore {
  return new MemoryStore((instance as { db: DrizzleSqliteDODatabase }).db);
}
