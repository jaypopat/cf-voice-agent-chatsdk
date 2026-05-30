import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getMemoryStoreFor } from "./helpers/memory-harness";

describe("MemoryStore (Drizzle)", () => {
  it("inserts and lists rows in newest-first order", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-mem")
    );
    await runInDurableObject(stub, async (instance) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "m1", kind: "note", text: "buy milk" });
      store.insert({ id: "m2", kind: "turn", text: "hello" });
      const rows = store.recent(10);
      expect(rows.map((r) => r.id)).toEqual(["m2", "m1"]);
      expect(rows[0].text).toBe("hello");
    });
  });

  it("getById returns one row or undefined", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-mem2")
    );
    await runInDurableObject(stub, async (instance) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "x1", kind: "note", text: "abc" });
      expect(store.getById("x1")?.text).toBe("abc");
      expect(store.getById("nope")).toBeUndefined();
    });
  });

  it("markEmbedded sets embedded flag to 1", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-mem3")
    );
    await runInDurableObject(stub, async (instance) => {
      const store = getMemoryStoreFor(instance);
      store.insert({ id: "e1", kind: "note", text: "embed me" });
      store.markEmbedded("e1");
      expect(store.getById("e1")?.embedded).toBe(1);
    });
  });

  it("extracted round-trip: serialized correctly and parses back", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-mem4")
    );
    await runInDurableObject(stub, async (instance) => {
      const store = getMemoryStoreFor(instance);
      store.insert({
        id: "ex1",
        kind: "note",
        text: "tagged item",
        extracted: { tags: ["x"] },
      });
      const row = store.getById("ex1");
      expect(row?.extracted).not.toBeNull();
      expect(JSON.parse(row!.extracted!)).toEqual({ tags: ["x"] });
    });
  });
});
