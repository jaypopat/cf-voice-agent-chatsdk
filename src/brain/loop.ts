import { runWithTools } from "@cloudflare/ai-utils";

type ModelId = Parameters<typeof runWithTools>[1];
type Tools = Parameters<typeof runWithTools>[2]["tools"];

export interface RunTurnArgs {
  ai: Ai;
  model: ModelId;
  system: string;
  userText: string;
  tools: Tools;
  maxSteps?: number;
}

export async function runTurn(args: RunTurnArgs): Promise<string> {
  const result = await runWithTools(
    // `Ai` from our generated worker-configuration.d.ts and from ai-utils'
    // bundled @cloudflare/workers-types are structurally identical but nominally
    // distinct; bridge the two declarations at this one boundary.
    args.ai as Parameters<typeof runWithTools>[0],
    args.model,
    {
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.userText },
      ],
      tools: args.tools,
    },
    { maxRecursiveToolRuns: args.maxSteps ?? 8 },
  );
  return result.response ?? "";
}
