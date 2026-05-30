import { routeAgentRequest } from "agents";

export { AssistantAgent } from "./agents/AssistantAgent";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await routeAgentRequest(request, env);
    if (!res) {
      return new Response("Not found", { status: 404 });
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
