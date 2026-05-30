import type { AiTextGenerationToolInputWithFunction } from "@cloudflare/ai-utils";
import type { VectorIndex } from "../memory/vector";
import type { MemoryStore } from "../memory/store";

export interface ToolDeps {
  vector: VectorIndex;
  store: MemoryStore;
}

export function makeTools(deps: ToolDeps): AiTextGenerationToolInputWithFunction[] {
  return [
    {
      name: "search_memory",
      description: "Search the user's long-term memory for relevant past notes, turns, and actions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for" },
          topK: { type: "number", description: "How many results to return (1-20)" },
        },
        required: ["query"],
      },
      function: async ({ query, topK }: { query: string; topK?: number }) => {
        const matches = await deps.vector.query(query, topK ?? 5);
        return JSON.stringify({ matches });
      },
    },
    {
      name: "save_note",
      description: "Persist a fact worth remembering to long-term memory.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The fact to remember" },
          tags: { type: "array", description: "Optional tags (array of strings)" },
        },
        required: ["text"],
      },
      function: async ({ text, tags }: { text: string; tags?: string[] }) => {
        const id = crypto.randomUUID();
        const created_at = Date.now();
        deps.store.insert({
          id,
          kind: "note",
          text,
          extracted: tags ? { tags } : undefined,
          created_at,
        });
        await deps.vector.upsertMemory({ id, text, kind: "note", created_at });
        deps.store.markEmbedded(id);
        return JSON.stringify({ saved: true, id });
      },
    },
  ];
}
