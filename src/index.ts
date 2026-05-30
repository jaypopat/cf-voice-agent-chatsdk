import { routeAgentRequest } from "agents";

// biome-ignore lint/performance/noBarrelFile: Workers entrypoint must export the Durable Object classes so the runtime can register them.
export { AssistantAgent } from "./agents/assistant-agent";
export { MessengerAgent } from "./agents/messenger-agent";
export { ChatSdkStateAgent } from "./agents/state";
export { VoiceAgent } from "./agents/voice-agent";

/** Constant-time string compare so the token check doesn't leak via timing. */
function tokenMatches(actual: string, expected: string): boolean {
  const a = new TextEncoder().encode(actual);
  const b = new TextEncoder().encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Reject browser voice connections that don't carry the shared bearer token.
 * Scoped to the voice agent's routing path so it can't gate other routes/assets.
 * (The token rides the WS query string — the voice client's only auth channel.)
 */
function voiceAuthFails(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/agents/voice-agent")) {
    return false;
  }
  return !tokenMatches(
    url.searchParams.get("token") ?? "",
    env.BROWSER_AUTH_TOKEN
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (voiceAuthFails(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const res = await routeAgentRequest(request, env);
    if (!res) {
      return new Response("Not found", { status: 404 });
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
