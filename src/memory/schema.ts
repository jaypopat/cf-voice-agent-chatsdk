import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const memory = sqliteTable("memory", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), // deterministic insertion order
  id: text("id").notNull().unique(),
  kind: text("kind").notNull(), // turn | note | event | reminder
  text: text("text").notNull(),
  extracted: text("extracted"), // JSON string or null
  channel: text("channel").notNull(), // voice | telegram | system
  createdAt: integer("created_at").notNull(),
  embedded: integer("embedded").notNull().default(0),
});

export type MemoryRow = typeof memory.$inferSelect;
// Note: the insert shape lives in src/memory/store.ts as `NewMemory` (extracted is an
// object there, serialized on write) — intentionally not the raw Drizzle $inferInsert.

// A proposed real-world mutation awaiting the user's one-tap confirm. The brain's
// propose_* tools write these (no external write yet); the confirm gate executes them.
export const pendingAction = sqliteTable("pending_action", {
  id: text("id").primaryKey(), // short id (fits Telegram's 64B callback budget)
  batchId: text("batch_id").notNull(), // groups one turn's proposals into one confirm
  type: text("type").notNull(), // event | reminder
  params: text("params").notNull(), // JSON
  status: text("status").notNull().default("pending"), // pending | done | failed | cancelled
  externalRef: text("external_ref"), // calendar event id, once executed
  createdAt: integer("created_at").notNull(),
});

export type PendingActionRow = typeof pendingAction.$inferSelect;

// A scheduled one-off reminder, fired by a Durable Object alarm via this.schedule().
export const reminder = sqliteTable("reminder", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  fireAt: integer("fire_at").notNull(),
  scheduleId: text("schedule_id"), // returned by this.schedule(), for cancel
  status: text("status").notNull().default("scheduled"), // scheduled | fired | cancelled
});

export type ReminderRow = typeof reminder.$inferSelect;

// Single-row cache (id = 1) of the current Google OAuth access token.
export const googleToken = sqliteTable("google_token", {
  id: integer("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
