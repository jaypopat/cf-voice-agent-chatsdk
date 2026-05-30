import { describe, expect, it } from "vitest";
import { runTurn, streamTurn } from "../src/brain/loop";
import { makeTools } from "../src/brain/tools";
import { MODELS } from "../src/config";

describe("runTurn", () => {
  it("returns the model's final text", async () => {
    // Workers AI has no local sim, so stub the AI binding. With no tool_calls in
    // the response, runWithTools returns the model output as-is.
    const ai = {
      run: async () => ({ response: "You have one note: buy milk [m1]." }),
    } as unknown as Ai;
    const vector = {
      query: async () => [],
      upsertMemory: () => Promise.resolve(),
    } as any;
    const store = {
      insert: () => undefined,
      markEmbedded: () => undefined,
    } as any;
    const tools = makeTools({ vector, store });
    const text = await runTurn({
      ai,
      model: MODELS.llm,
      system: "sys",
      userText: "what notes do I have?",
      tools,
      maxSteps: 4,
    });
    expect(text).toContain("buy milk");
  });

  it("streams the final reply as a ReadableStream when streaming", async () => {
    // runWithTools makes its final AI.run with stream:true and returns that
    // result directly. With no tool_calls, it goes straight to the final call.
    const finalStream = new ReadableStream<Uint8Array>();
    const ai = {
      run: (_model: string, opts: { stream?: boolean }) =>
        Promise.resolve(
          opts.stream ? finalStream : { response: "", tool_calls: [] }
        ),
    } as unknown as Ai;
    const vector = {
      query: async () => [],
      upsertMemory: () => Promise.resolve(),
    } as any;
    const store = {
      insert: () => undefined,
      markEmbedded: () => undefined,
    } as any;
    const tools = makeTools({ vector, store });
    const stream = await streamTurn({
      ai,
      model: MODELS.llm,
      system: "sys",
      userText: "hi",
      tools,
      maxSteps: 4,
    });
    expect(stream).toBe(finalStream);
  });
});
