import { MemoryStore } from "../../src/memory/store";

export function getMemoryStoreFor(instance: any): MemoryStore {
  return instance.getMemoryStore();
}
