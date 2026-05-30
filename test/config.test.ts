import { describe, it, expect } from "vitest";
import { MODELS, EMBED_DIM } from "../src/config";

describe("MODELS", () => {
  it("uses the free-tier-friendly model set", () => {
    expect(MODELS.llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(MODELS.stt).toBe("@cf/deepgram/flux");
    expect(MODELS.tts).toBe("@cf/myshell-ai/melotts");
    expect(MODELS.embed).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });

  it("embed dim matches qwen3-embedding-0.6b (1024)", () => {
    expect(EMBED_DIM).toBe(1024);
  });
});
