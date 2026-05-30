import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";

describe("AssistantAgent.handleTurn", () => {
  it("stores the user turn and returns the model reply", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("main-test"));
    const reply = await runInDurableObject(stub, async (agent) => {
      agent.__setTestAI({ run: async () => ({ response: "Got it." }) } as unknown as Ai);
      agent.__setTestVector({ query: async () => [], upsertMemory: async () => {} });
      const r = await agent.handleTurn({ text: "hello brain", channel: "telegram" });
      const rows = agent.testRecent(10);
      expect(rows.some((row) => row.text === "hello brain")).toBe(true);
      return r;
    });
    expect(reply).toBe("Got it.");
  });
});
