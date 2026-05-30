import { describe, it, expect, vi } from "vitest";
import { makeTools } from "../src/brain/tools";

describe("makeTools", () => {
  it("search_memory returns matches from the index", async () => {
    const vector = { query: vi.fn(async () => [{ id: "m1", score: 0.9, snippet: "buy milk", kind: "note", created_at: 1 }]) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = await tools.search_memory.execute({ query: "milk", topK: 5 }, {} as any);
    expect(out.matches[0].id).toBe("m1");
    expect(vector.query).toHaveBeenCalledWith("milk", 5);
  });

  it("save_note inserts to store and upserts to the index", async () => {
    const vector = { upsertMemory: vi.fn(async () => {}) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const out = await tools.save_note.execute({ text: "remember this" }, {} as any);
    expect(store.insert).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", kind: "note", text: "remember this" }));
    expect(vector.upsertMemory).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", text: "remember this" }));
    expect(out.saved).toBe(true);
  });
});
