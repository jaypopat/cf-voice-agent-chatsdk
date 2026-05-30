import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const memory = sqliteTable("memory", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), // deterministic insertion order
  id: text("id").notNull().unique(),
  kind: text("kind").notNull(),         // turn | note | event | reminder
  text: text("text").notNull(),
  extracted: text("extracted"),         // JSON string or null
  channel: text("channel").notNull(),   // voice | telegram | system
  createdAt: integer("created_at").notNull(),
  embedded: integer("embedded").notNull().default(0),
});

export type MemoryRow = typeof memory.$inferSelect;
export type NewMemory = typeof memory.$inferInsert;
