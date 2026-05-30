import type { AiTextGenerationToolInputWithFunction } from "@cloudflare/ai-utils";
import { runWithTools } from "@cloudflare/ai-utils";
import type { Ai as WorkersAi } from "@cloudflare/workers-types";

const DEFAULT_MAX_STEPS = 8;

export interface RunTurnArgs {
  ai: Ai;
  maxSteps?: number;
  model: string;
  system: string;
  tools: AiTextGenerationToolInputWithFunction[];
  userText: string;
}

function run(args: RunTurnArgs, streamFinalResponse: boolean) {
  return runWithTools(
    args.ai as WorkersAi,
    args.model,
    {
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.userText },
      ],
      tools: args.tools,
    },
    {
      maxRecursiveToolRuns: args.maxSteps ?? DEFAULT_MAX_STEPS,
      streamFinalResponse,
    }
  );
}

/** Run the agentic loop and return the final reply as a buffered string. */
export async function runTurn(args: RunTurnArgs): Promise<string> {
  const result = await run(args, false);
  return result.response ?? "";
}

/**
 * Run the agentic loop and return the final reply as a token stream. Tool calls
 * still complete first (so action proposals are persisted before the promise
 * resolves); only the final assistant message streams — letting voice speak it
 * sentence-by-sentence instead of waiting for the whole reply.
 */
export async function streamTurn(
  args: RunTurnArgs
): Promise<ReadableStream<Uint8Array>> {
  const result = await run(args, true);
  // streamFinalResponse makes runWithTools resolve to a ReadableStream, but the
  // shared output type doesn't reflect that — fail loudly rather than hand the
  // voice pipeline a non-stream it would silently speak as nothing.
  if (!(result instanceof ReadableStream)) {
    throw new Error("streamTurn: runWithTools did not return a stream");
  }
  return result;
}
