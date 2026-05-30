import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { runTurn } from "../src/brain/loop";
import { makeTools } from "../src/brain/tools";

describe("runTurn", () => {
  it("returns the model's final text", async () => {
    // NOTE: This project has ai@6.0.193+ which uses LanguageModelV3 internally.
    // MockLanguageModelV2 is NOT exported; use MockLanguageModelV3.
    // LanguageModelV3GenerateResult shape:
    //   finishReason: { unified: 'stop' | ..., raw: string | undefined }
    //   usage: { inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, text, reasoning } }
    //   content: Array<LanguageModelV3Content> — text items are { type: 'text', text: string }
    //   warnings: Array<SharedV3Warning>
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: undefined, reasoning: undefined },
        },
        content: [{ type: "text", text: "You have one note: buy milk [m1]." }],
        warnings: [],
      }),
    });
    const vector = { query: async () => [], upsertMemory: async () => {} } as any;
    const store = { insert: () => {}, markEmbedded: () => {} } as any;
    const tools = makeTools({ vector, store, newId: () => "id1" });
    const text = await runTurn({ model, system: "sys", userText: "what notes do I have?", tools, maxSteps: 4 });
    expect(text).toContain("buy milk");
  });
});
