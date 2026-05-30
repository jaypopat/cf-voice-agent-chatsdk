import { describe, it, expect, vi } from "vitest";
import { makeTools } from "../src/brain/tools";

const byName = (tools: ReturnType<typeof makeTools>, name: string) => {
  const t = tools.find((t) => t.name === name);
  if (!t?.function) throw new Error(`tool ${name} not found`);
  return t.function;
};

describe("makeTools", () => {
  it("search_memory returns matches from the index", async () => {
    const vector = { query: vi.fn(async () => [{ id: "m1", score: 0.9, snippet: "buy milk", kind: "note", created_at: 1 }]) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = JSON.parse(await byName(tools, "search_memory")({ query: "milk", topK: 5 }));
    expect(out.matches[0].id).toBe("m1");
    expect(vector.query).toHaveBeenCalledWith("milk", 5);
  });

  it("save_note inserts to store and upserts to the index", async () => {
    const vector = { upsertMemory: vi.fn(async () => {}) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = JSON.parse(await byName(tools, "save_note")({ text: "remember this" }));
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", kind: "note", text: "remember this" }));
    expect(vector.upsertMemory).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", text: "remember this" }));
    expect(out.saved).toBe(true);
  });
});
