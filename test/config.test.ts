import { describe, expect, it } from "vitest";
import { MODELS } from "../src/config";

describe("MODELS", () => {
  it("uses the free-tier-friendly model set", () => {
    expect(MODELS.llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(MODELS.stt).toBe("@cf/deepgram/flux");
    expect(MODELS.tts).toBe("@cf/deepgram/aura-1");
    expect(MODELS.embed).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });
});
