import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { getMemoryStoreFor } from "./helpers/memory-harness";

describe("MemoryStore (Drizzle)", () => {
  it("inserts and lists rows in insertion order", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("test-mem"));
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "m1", kind: "note", text: "buy milk", channel: "telegram" });
      store.insert({ id: "m2", kind: "turn", text: "hello", channel: "voice" });
      const rows = store.recent(10);
      expect(rows.map((r: any) => r.id)).toEqual(["m1", "m2"]);
      expect(rows[0].text).toBe("buy milk");
    });
  });

  it("getById returns one row or undefined", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("test-mem2"));
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "x1", kind: "note", text: "abc", channel: "system" });
      expect(store.getById("x1")?.text).toBe("abc");
      expect(store.getById("nope")).toBeUndefined();
    });
  });
});
