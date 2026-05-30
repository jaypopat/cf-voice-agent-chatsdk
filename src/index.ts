import { routeAgentRequest } from "agents";

// biome-ignore lint/performance/noBarrelFile: Workers entrypoint must export the Durable Object classes so the runtime can register them.
export { AssistantAgent } from "./agents/assistant-agent";
export { VoiceAgent } from "./agents/voice-agent";

/** Reject browser voice connections that don't carry the shared bearer token. */
function voiceAuthFails(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  if (!url.pathname.includes("/voice-agent")) {
    return false;
  }
  return url.searchParams.get("token") !== env.BROWSER_AUTH_TOKEN;
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
