import { describe, expect, it } from "vitest";
import { runTurn } from "../src/brain/loop";
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
});
