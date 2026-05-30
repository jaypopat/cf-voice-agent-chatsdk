import { describe, it, expect, vi } from "vitest";
import { processTurn } from "../src/brain/turn";

describe("processTurn", () => {
  it("persists the turn, runs the loop, and returns the reply", async () => {
    // With no tool_calls in the response, runWithTools returns the model output as-is.
    const ai = { run: async () => ({ response: "Got it." }) } as unknown as Ai;
    const inserted: Array<{ id: string; kind: string; text: string; channel: string }> = [];
    const store = { insert: (m: any) => inserted.push(m), markEmbedded: vi.fn() } as any;
    const vector = { query: async () => [], upsertMemory: vi.fn(async () => {}) } as any;

    const reply = await processTurn(
      { ai, model: "test-model", store, vector, newId: () => "id1" },
      { text: "hello brain", channel: "telegram" },
    );

    expect(reply).toBe("Got it.");
    expect(inserted[0]).toMatchObject({ id: "id1", kind: "turn", text: "hello brain", channel: "telegram" });
    expect(vector.upsertMemory).toHaveBeenCalledWith(expect.objectContaining({ id: "id1", text: "hello brain" }));
    expect(store.markEmbedded).toHaveBeenCalledWith("id1");
  });

  it("does not block the reply when embedding fails", async () => {
    const ai = { run: async () => ({ response: "ok" }) } as unknown as Ai;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const vector = {
      query: async () => [],
      upsertMemory: async () => { throw new Error("vectorize down"); },
    } as any;

    const reply = await processTurn(
      { ai, model: "m", store, vector, newId: () => "id2" },
      { text: "hi", channel: "voice" },
    );

    expect(reply).toBe("ok");
    expect(store.insert).toHaveBeenCalled();        // turn still persisted
    expect(store.markEmbedded).not.toHaveBeenCalled(); // embed threw before markEmbedded
  });
});
