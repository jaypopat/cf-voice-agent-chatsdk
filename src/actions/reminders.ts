import { eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { reminder } from "../memory/schema";

export interface NewReminder {
  fireAt: number;
  id: string;
  scheduleId: string;
  text: string;
}

/** CRUD over the reminder table — scheduled one-off reminders. */
export class ReminderStore {
  constructor(private readonly db: DrizzleSqliteDODatabase) {}

  insert(r: NewReminder): void {
    this.db
      .insert(reminder)
      .values({
        id: r.id,
        text: r.text,
        fireAt: r.fireAt,
        scheduleId: r.scheduleId,
        status: "scheduled",
      })
      .run();
  }

  byId(id: string) {
    return this.db.select().from(reminder).where(eq(reminder.id, id)).get();
  }

  markFired(id: string): void {
    this.db
      .update(reminder)
      .set({ status: "fired" })
      .where(eq(reminder.id, id))
      .run();
  }
}
