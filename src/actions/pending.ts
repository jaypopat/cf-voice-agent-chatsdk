import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { type PendingActionRow, pendingAction } from "../memory/schema";

export type PendingType = "event" | "reminder";
export type PendingStatus = "pending" | "done" | "failed" | "cancelled";

export interface NewPendingAction {
  batchId: string;
  id: string;
  params: Record<string, unknown>;
  type: PendingType;
}

/** CRUD over the pending_action table — the durable record behind the confirm gate. */
export class PendingStore {
  constructor(private readonly db: DrizzleSqliteDODatabase) {}

  insert(a: NewPendingAction): void {
    this.db
      .insert(pendingAction)
      .values({
        id: a.id,
        batchId: a.batchId,
        type: a.type,
        params: JSON.stringify(a.params),
        status: "pending",
        createdAt: Date.now(),
      })
      .run();
  }

  byBatch(batchId: string): PendingActionRow[] {
    return this.db
      .select()
      .from(pendingAction)
      .where(eq(pendingAction.batchId, batchId))
      .all();
  }

  byId(id: string): PendingActionRow | undefined {
    return this.db
      .select()
      .from(pendingAction)
      .where(eq(pendingAction.id, id))
      .get();
  }

  setStatus(id: string, status: PendingStatus): void {
    this.db
      .update(pendingAction)
      .set({ status })
      .where(eq(pendingAction.id, id))
      .run();
  }

  setExternalRef(id: string, externalRef: string): void {
    this.db
      .update(pendingAction)
      .set({ externalRef })
      .where(eq(pendingAction.id, id))
      .run();
  }
}
