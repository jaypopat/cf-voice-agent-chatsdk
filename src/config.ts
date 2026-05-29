export type ModelProfile = "dev" | "prod";

export interface Models {
  llm: string;
  stt: string;
  tts: string;
  embed: string;
}

const PROFILES: Record<ModelProfile, Models> = {
  dev: {
    llm: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    stt: "@cf/deepgram/flux",
    tts: "@cf/myshell-ai/melotts",
    embed: "@cf/qwen/qwen3-embedding-0.6b",
  },
  prod: {
    llm: "@cf/moonshotai/kimi-k2.6",
    stt: "@cf/deepgram/flux",
    tts: "@cf/deepgram/aura-1",
    embed: "@cf/qwen/qwen3-embedding-0.6b",
  },
};

export const EMBED_DIM = 1024; // qwen3-embedding-0.6b output dimension

export function resolveModels(profile: string | undefined): Models {
  return profile === "prod" ? PROFILES.prod : PROFILES.dev;
}
