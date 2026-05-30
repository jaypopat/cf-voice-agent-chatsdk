import { generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai";

export interface RunTurnArgs {
  model: LanguageModel;
  system: string;
  userText: string;
  tools: ToolSet;
  maxSteps?: number;
}

export async function runTurn(args: RunTurnArgs): Promise<string> {
  const { text } = await generateText({
    model: args.model,
    system: args.system,
    prompt: args.userText,
    tools: args.tools,
    stopWhen: stepCountIs(args.maxSteps ?? 8),
  });
  return text;
}
