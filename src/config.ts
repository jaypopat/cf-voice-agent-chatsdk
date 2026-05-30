export interface Models {
  llm: string;
  stt: string;
  tts: string;
  embed: string;
}

// Single model set (free-tier-friendly). Centralized here so model ids never
// live in business logic. Swap an id later = one-line change.
export const MODELS: Models = {
  llm: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  stt: "@cf/deepgram/flux",
  tts: "@cf/myshell-ai/melotts",
  embed: "@cf/qwen/qwen3-embedding-0.6b",
};

export const EMBED_DIM = 1024; // qwen3-embedding-0.6b output dimension
