import { tool } from "ai";
import { z } from "zod";
import type { VectorIndex } from "../memory/vector";
import type { MemoryStore } from "../memory/store";

export interface ToolDeps {
  vector: Pick<VectorIndex, "query" | "upsertMemory">;
  store: Pick<MemoryStore, "insert" | "markEmbedded">;
  newId: () => string;
  channel?: "voice" | "telegram" | "system";
}

export function makeTools(deps: ToolDeps) {
  return {
    search_memory: tool({
      description: "Search the user's long-term memory for relevant past notes, turns, and actions.",
      inputSchema: z.object({
        query: z.string().describe("What to search for"),
        topK: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ query, topK }) => {
        const matches = await deps.vector.query(query, topK);
        return { matches };
      },
    }),
    save_note: tool({
      description: "Persist a fact worth remembering to long-term memory.",
      inputSchema: z.object({
        text: z.string().describe("The fact to remember"),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ text, tags }) => {
        const id = deps.newId();
        const created_at = Date.now();
        deps.store.insert({
          id,
          kind: "note",
          text,
          channel: deps.channel ?? "system",
          extracted: tags ? { tags } : undefined,
          created_at,
        });
        await deps.vector.upsertMemory({ id, text, kind: "note", created_at });
        deps.store.markEmbedded(id);
        return { saved: true, id };
      },
    }),
  };
}
