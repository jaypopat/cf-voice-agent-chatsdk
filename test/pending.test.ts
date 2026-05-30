import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { describe, expect, it } from "vitest";
import { PendingStore } from "../src/actions/pending";

const storeFor = (instance: unknown) =>
  new PendingStore((instance as { db: DrizzleSqliteDODatabase }).db);

describe("PendingStore", () => {
  it("inserts pending actions and reads them back by batch", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-pending")
    );
    await runInDurableObject(stub, (instance) => {
      const store = storeFor(instance);
      store.insert({
        id: "a1",
        batchId: "b1",
        type: "event",
        params: { title: "Dentist" },
      });
      store.insert({
        id: "a2",
        batchId: "b1",
        type: "reminder",
        params: { text: "insurance card" },
      });
      const batch = store.byBatch("b1");
      expect(batch.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
      expect(batch.every((a) => a.status === "pending")).toBe(true);
      expect(JSON.parse(store.byId("a1")?.params ?? "{}")).toEqual({
        title: "Dentist",
      });
    });
  });

  it("transitions status and records the external ref", async () => {
    const stub = env.AssistantAgent.get(
      env.AssistantAgent.idFromName("test-pending2")
    );
    await runInDurableObject(stub, (instance) => {
      const store = storeFor(instance);
      store.insert({ id: "x1", batchId: "b2", type: "event", params: {} });
      store.setExternalRef("x1", "gcal-123");
      store.setStatus("x1", "done");
      const row = store.byId("x1");
      expect(row?.status).toBe("done");
      expect(row?.externalRef).toBe("gcal-123");
    });
  });
});
