import type { AssistantAgent } from "../../src/agents/AssistantAgent";
import type { MemoryStore } from "../../src/memory/store";

export function getMemoryStoreFor(instance: AssistantAgent): MemoryStore {
  return instance.getMemoryStore();
}
