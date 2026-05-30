import { describe, expect, it, vi } from "vitest";
import { processTurn, processTurnStreaming } from "../src/brain/turn";

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

    const pending = { insert: vi.fn() } as any;
    const { reply } = await processTurn(
      { ai, model: "test-model", store, vector, pending, tz: "UTC" },
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

    const pending = { insert: vi.fn() } as any;
    const { reply } = await processTurn(
      { ai, model: "m", store, vector, pending, tz: "UTC" },
      "hi"
    );

    expect(reply).toBe("ok");
    expect(store.insert).toHaveBeenCalled();
    expect(store.markEmbedded).not.toHaveBeenCalled();
  });

  it("streams the reply and still lands proposals under the batch id", async () => {
    // Tool calls run (stream:false) before the final reply streams (stream:true).
    // The streaming path must still persist proposals so the confirm card fires.
    const finalStream = new ReadableStream<Uint8Array>();
    let toolRound = 0;
    const ai = {
      run: (_m: string, opts: { stream?: boolean }) => {
        if (opts.stream) {
          return Promise.resolve(finalStream);
        }
        toolRound++;
        if (toolRound === 1) {
          return Promise.resolve({
            tool_calls: [
              {
                name: "propose_event",
                arguments: {
                  title: "Dentist",
                  start: "2026-06-04T14:00:00-04:00",
                },
              },
            ],
          });
        }
        return Promise.resolve({ tool_calls: [] });
      },
    } as unknown as Ai;
    const store = { insert: vi.fn(), markEmbedded: vi.fn() } as any;
    const vector = {
      query: async () => [],
      upsertMemory: vi.fn(() => Promise.resolve()),
    } as any;
    const pending = { insert: vi.fn() } as any;

    const { stream, batchId } = await processTurnStreaming(
      { ai, model: "m", store, vector, pending, tz: "UTC" },
      "schedule a dentist appointment thursday 2pm"
    );

    expect(stream).toBe(finalStream);
    expect(batchId).toEqual(expect.any(String));
    expect(store.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "turn" })
    );
    expect(pending.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event",
        batchId,
        params: expect.objectContaining({ title: "Dentist" }),
      })
    );
  });
});
