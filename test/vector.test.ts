import { describe, it, expect, vi } from "vitest";
import { VectorIndex } from "../src/memory/vector";

function fakeAI(vec: number[]) {
  return { run: vi.fn(async () => ({ shape: [1, vec.length], data: [vec] })) } as any;
}
function fakeVectorize() {
  const store: any[] = [];
  return {
    _store: store,
    insert: vi.fn(async (vs: any[]) => { store.push(...vs); }),
    upsert: vi.fn(async (vs: any[]) => { store.push(...vs); }),
    query: vi.fn(async (_v: number[], opts: any) => ({
      count: Math.min(opts.topK, store.length),
      matches: store.slice(0, opts.topK).map((s) => ({ id: s.id, score: 0.9, metadata: s.metadata })),
    })),
  } as any;
}

describe("VectorIndex", () => {
  it("embeds text and passes data[0] to query", async () => {
    const ai = fakeAI([0.1, 0.2, 0.3]);
    const vz = fakeVectorize();
    const idx = new VectorIndex(ai, vz, "@cf/qwen/qwen3-embedding-0.6b");
    await idx.query("hello", 5);
    expect(ai.run).toHaveBeenCalledWith("@cf/qwen/qwen3-embedding-0.6b", { text: ["hello"] });
    expect(vz.query).toHaveBeenCalledWith([0.1, 0.2, 0.3], expect.objectContaining({ topK: 5, returnMetadata: "all" }));
  });

  it("upserts a memory with id + snippet metadata", async () => {
    const ai = fakeAI([1, 2, 3]);
    const vz = fakeVectorize();
    const idx = new VectorIndex(ai, vz, "@cf/qwen/qwen3-embedding-0.6b");
    await idx.upsertMemory({ id: "m1", text: "buy milk", kind: "note", created_at: 123 });
    expect(vz._store[0].id).toBe("m1");
    expect(vz._store[0].values).toEqual([1, 2, 3]);
    expect(vz._store[0].metadata).toMatchObject({ snippet: "buy milk", kind: "note" });
  });

  it("maps query matches to a clean shape", async () => {
    const ai = fakeAI([1, 2, 3]);
    const vz = fakeVectorize();
    const idx = new VectorIndex(ai, vz, "@cf/qwen/qwen3-embedding-0.6b");
    await idx.upsertMemory({ id: "m1", text: "buy milk", kind: "note", created_at: 123 });
    const out = await idx.query("milk", 5);
    expect(out[0]).toMatchObject({ id: "m1", snippet: "buy milk", kind: "note", created_at: 123 });
    expect(typeof out[0].score).toBe("number");
  });
});
