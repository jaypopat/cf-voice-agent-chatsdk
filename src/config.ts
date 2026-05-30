// STT isn't here: @cloudflare/voice's WorkersAIFluxSTT has the model baked in
// (it takes only the AI binding), so there's no stt id to configure.
export const MODELS = {
  llm: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  tts: "@cf/deepgram/aura-1",
  embed: "@cf/qwen/qwen3-embedding-0.6b",
} as const;
