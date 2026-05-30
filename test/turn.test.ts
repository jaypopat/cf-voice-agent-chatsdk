import { describe, expect, it, vi } from "vitest";
import { processTurn } from "../src/brain/turn";

describe("processTurn", () => {
  it("persists the turn, runs the loop, and returns the reply", async () => {
    // With no tool_calls in the response, runWithTools returns the model output as-is.
    const ai = { run: async () => ({ response: "Got it." }) } as unknown as Ai;
    const inserted: Array<{ kind: string; text: string }> = [];
    const store = {
      insert: (m: any) => inserted.push(m),
      markEmbedded: vi.fn(),
    } as any;
    const vector = {
      query: async () => [],
      upsertMemory: vi.fn(() => Promise.resolve()),
    } as any;

    const reply = await processTurn(
      { ai, model: "test-model", store, vector },
      "hello brain"
    );

    expect(reply).toBe("Got it.");
    expect(inserted[0]).toMatchObject({ kind: "turn", text: "hello brain" });
    expect(vector.upsertMemory).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello brain" })
    );
    expect(store.markEmbedded).toHaveBeenCalled();
  });

  it("does not block the reply when embedding fails", async () => {
    const ai = { run: async () => ({ response: "ok" }) } as unknown as Ai;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const vector = {
      query: async () => [],
      upsertMemory: () => Promise.reject(new Error("vectorize down")),
    } as any;

    const reply = await processTurn({ ai, model: "m", store, vector }, "hi");

    expect(reply).toBe("ok");
    expect(store.insert).toHaveBeenCalled();
    expect(store.markEmbedded).not.toHaveBeenCalled();
  });
});
