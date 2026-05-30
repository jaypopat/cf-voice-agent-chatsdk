import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { getMemoryStoreFor } from "./helpers/memory-harness";

describe("MemoryStore (Drizzle)", () => {
  it("inserts and lists rows in newest-first order", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("test-mem"));
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "m1", kind: "note", text: "buy milk", channel: "telegram" });
      store.insert({ id: "m2", kind: "turn", text: "hello", channel: "voice" });
      const rows = store.recent(10);
      expect(rows.map((r: any) => r.id)).toEqual(["m2", "m1"]);
      expect(rows[0].text).toBe("hello");
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

  it("markEmbedded sets embedded flag to 1", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("test-mem3"));
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "e1", kind: "note", text: "embed me", channel: "system" });
      store.markEmbedded("e1");
      const row = store.getById("e1");
      expect(row?.embedded).toBe(1);
    });
  });

  it("extracted round-trip: serialized correctly and parses back", async () => {
    const stub = env.AssistantAgent.get(env.AssistantAgent.idFromName("test-mem4"));
    await runInDurableObject(stub, async (instance: any) => {
      const store = getMemoryStoreFor(instance);
      store.insert({
        id: "ex1",
        kind: "note",
        text: "tagged item",
        channel: "system",
        extracted: { tags: ["x"] },
      });
      const row = store.getById("ex1");
      expect(row?.extracted).not.toBeNull();
      expect(JSON.parse(row!.extracted!)).toEqual({ tags: ["x"] });
    });
  });
});
