import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { MockLanguageModelV3 } from "ai/test";

describe("AssistantAgent.handleTurn", () => {
  it("stores the user turn and returns the model reply", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("main-test"));
    const reply = await runInDurableObject(stub, async (agent: any) => {
      agent.__setTestModel(
        new MockLanguageModelV3({
          doGenerate: async () => ({
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 1, text: undefined, reasoning: undefined },
            },
            content: [{ type: "text", text: "Got it." }],
            warnings: [],
          }),
        }),
      );
      agent.__setTestVector({ query: async () => [], upsertMemory: async () => {} });
      const r = await agent.handleTurn({ text: "hello brain", channel: "telegram" });
      const rows = agent.testRecent(10);
      expect(rows.some((row: any) => row.text === "hello brain")).toBe(true);
      return r;
    });
    expect(reply).toBe("Got it.");
  });
});
