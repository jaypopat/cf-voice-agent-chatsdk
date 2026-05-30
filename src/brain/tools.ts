import type { AiTextGenerationToolInputWithFunction } from "@cloudflare/ai-utils";
import type { PendingStore } from "../actions/pending";
import type { MemoryStore } from "../memory/store";
import type { VectorIndex } from "../memory/vector";

export interface ToolDeps {
  batchId?: string;
  // Present on a real turn (a Durable Object with a db). When set, the brain can
  // propose real-world actions that land in the confirm gate.
  pending?: PendingStore;
  store: MemoryStore;
  vector: VectorIndex;
}

const SHORT_ID_LEN = 8;
const shortId = () => crypto.randomUUID().slice(0, SHORT_ID_LEN);

function recallTools(deps: ToolDeps): AiTextGenerationToolInputWithFunction[] {
  return [
    {
      name: "search_memory",
      description:
        "Search the user's long-term memory for relevant past notes, turns, and actions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for" },
          topK: {
            type: "number",
            description: "How many results to return (1-20)",
          },
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
          tags: {
            type: "array",
            description: "Optional tags (array of strings)",
          },
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

/**
 * Action proposals. These NEVER mutate the outside world — they record a
 * pending_action that the user confirms with one tap; the confirm gate executes
 * it. Times must be absolute ISO 8601 (the system prompt gives the model the
 * current time + timezone to resolve natural-language times).
 */
function actionTools(
  pending: PendingStore,
  batchId: string
): AiTextGenerationToolInputWithFunction[] {
  return [
    {
      name: "propose_event",
      description:
        "Propose a Google Calendar event for the user to confirm. Does not create it yet.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start: {
            type: "string",
            description:
              "Start time, absolute ISO 8601 (e.g. 2026-06-04T14:00:00-04:00)",
          },
          end: {
            type: "string",
            description:
              "End time, absolute ISO 8601. Defaults to one hour after start.",
          },
          location: { type: "string", description: "Optional location" },
          notes: { type: "string", description: "Optional description" },
        },
        required: ["title", "start"],
      },
      function: (params: {
        title: string;
        start: string;
        end?: string;
        location?: string;
        notes?: string;
      }) => {
        const id = shortId();
        pending.insert({ id, batchId, type: "event", params });
        return Promise.resolve(JSON.stringify({ proposed: true, id }));
      },
    },
    {
      name: "propose_reminder",
      description:
        "Propose a one-off reminder for the user to confirm. Does not schedule it yet.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "What to remind the user about",
          },
          when: {
            type: "string",
            description:
              "Fire time, absolute ISO 8601 (e.g. 2026-06-04T13:00:00-04:00)",
          },
        },
        required: ["text", "when"],
      },
      function: (params: { text: string; when: string }) => {
        const id = shortId();
        pending.insert({ id, batchId, type: "reminder", params });
        return Promise.resolve(JSON.stringify({ proposed: true, id }));
      },
    },
  ];
}

export function makeTools(
  deps: ToolDeps
): AiTextGenerationToolInputWithFunction[] {
  const tools = recallTools(deps);
  if (deps.pending && deps.batchId) {
    tools.push(...actionTools(deps.pending, deps.batchId));
  }
  return tools;
}
