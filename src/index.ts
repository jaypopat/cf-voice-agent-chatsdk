import { routeAgentRequest } from "agents";

// export { AssistantAgent } from "./agents/AssistantAgent"; // enabled in Task 7

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
