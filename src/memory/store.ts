// Type matching the sql tagged-template method exposed on Agent (from agents SDK)
type SqlFn = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

export const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS memory (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  id          TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL,
  text        TEXT NOT NULL,
  extracted   TEXT,
  channel     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  embedded    INTEGER NOT NULL DEFAULT 0
);
`;

export interface MemoryRow {
  id: string;
  kind: "turn" | "note" | "event" | "reminder";
  text: string;
  extracted?: string;
  channel: "voice" | "telegram" | "system";
  created_at: number;
  embedded: number;
}

export interface NewMemory {
  id: string;
  kind: MemoryRow["kind"];
  text: string;
  channel: MemoryRow["channel"];
  extracted?: Record<string, unknown>;
  created_at?: number;
}

// Internal row shape returned by SELECT (includes seq for ordering)
type MemoryRowRaw = MemoryRow & { seq: number };

export class MemoryStore {
  private sql: SqlFn;

  constructor(sql: SqlFn) {
    this.sql = sql;
  }

  insert(m: NewMemory): void {
    const createdAt = m.created_at ?? Date.now();
    const extracted = m.extracted != null ? JSON.stringify(m.extracted) : null;
    this.sql`
      INSERT INTO memory (id, kind, text, extracted, channel, created_at, embedded)
      VALUES (${m.id}, ${m.kind}, ${m.text}, ${extracted}, ${m.channel}, ${createdAt}, ${0})
    `;
  }

  markEmbedded(id: string): void {
    this.sql`UPDATE memory SET embedded = ${1} WHERE id = ${id}`;
  }

  getById(id: string): MemoryRow | undefined {
    const rows = this.sql<MemoryRowRaw>`
      SELECT id, kind, text, extracted, channel, created_at, embedded, seq
      FROM memory
      WHERE id = ${id}
      LIMIT 1
    `;
    if (rows.length === 0) return undefined;
    const { seq: _seq, ...row } = rows[0];
    return row as MemoryRow;
  }

  recent(limit: number): MemoryRow[] {
    const rows = this.sql<MemoryRowRaw>`
      SELECT id, kind, text, extracted, channel, created_at, embedded, seq
      FROM memory
      ORDER BY seq ASC
      LIMIT ${limit}
    `;
    return rows.map(({ seq: _seq, ...row }) => row as MemoryRow);
  }
}
