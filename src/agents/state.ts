// Re-export the Agents SDK's Chat-SDK state Durable Object so wrangler can
// register it. It persists the Vercel Chat SDK's locks/queues/subscriptions as
// a sub-agent of MessengerAgent (resolved via getCurrentAgent() inside the
// agent context). We don't subclass it — the stock implementation is complete.
// biome-ignore lint/performance/noBarrelFile: the Durable Object class must be re-exported from the worker so the runtime can register it.
export { ChatSdkStateAgent } from "agents/chat-sdk";
