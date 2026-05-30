import { describe, expect, it, vi } from "vitest";
import { makeTools } from "../src/brain/tools";

const byName = (tools: ReturnType<typeof makeTools>, name: string) => {
  const t = tools.find((t) => t.name === name);
  if (!t?.function) {
    throw new Error(`tool ${name} not found`);
  }
  return t.function;
};

describe("makeTools", () => {
  it("search_memory returns matches from the index", async () => {
    const vector = {
      query: vi.fn(async () => [
        {
          id: "m1",
          score: 0.9,
          snippet: "buy milk",
          kind: "note",
          created_at: 1,
        },
      ]),
    } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store });
    const out = JSON.parse(
      await byName(tools, "search_memory")({ query: "milk", topK: 5 })
    );
    expect(out.matches[0].id).toBe("m1");
    expect(vector.query).toHaveBeenCalledWith("milk", 5);
  });

  it("save_note inserts to store and upserts to the index", async () => {
    const vector = { upsertMemory: vi.fn(() => Promise.resolve()) } as any;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const tools = makeTools({ vector, store });
    const out = JSON.parse(
      await byName(tools, "save_note")({ text: "remember this" })
    );
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "note", text: "remember this" })
    );
    expect(vector.upsertMemory).toHaveBeenCalledWith(
      expect.objectContaining({ text: "remember this" })
    );
    expect(out.saved).toBe(true);
    expect(typeof out.id).toBe("string");
  });

  it("omits propose tools when no pending store is wired", () => {
    const vector = {} as any;
    const store = {} as any;
    const names = makeTools({ vector, store }).map((t) => t.name);
    expect(names).not.toContain("propose_event");
    expect(names).not.toContain("propose_reminder");
  });

  it("propose_event records a pending action under the batch", async () => {
    const vector = {} as any;
    const store = {} as any;
    const pending = { insert: vi.fn() } as any;
    const tools = makeTools({ vector, store, pending, batchId: "batch1" });
    const out = JSON.parse(
      await byName(
        tools,
        "propose_event"
      )({
        title: "Dentist",
        start: "2026-06-04T14:00:00-04:00",
      })
    );
    expect(out.proposed).toBe(true);
    expect(pending.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: "batch1",
        type: "event",
        params: expect.objectContaining({ title: "Dentist" }),
      })
    );
  });
});
