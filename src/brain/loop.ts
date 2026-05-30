import type { AiTextGenerationToolInputWithFunction } from "@cloudflare/ai-utils";
import { runWithTools } from "@cloudflare/ai-utils";
import type { Ai as WorkersAi } from "@cloudflare/workers-types";

export interface RunTurnArgs {
  ai: Ai;
  maxSteps?: number;
  model: string;
  system: string;
  tools: AiTextGenerationToolInputWithFunction[];
  userText: string;
}

export async function runTurn(args: RunTurnArgs): Promise<string> {
  const result = await runWithTools(
    args.ai as WorkersAi,
    args.model,
    {
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.userText },
      ],
      tools: args.tools,
    },
    { maxRecursiveToolRuns: args.maxSteps ?? 8 }
  );
  return result.response ?? "";
}
