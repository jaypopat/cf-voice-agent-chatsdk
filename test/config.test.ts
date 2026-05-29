import { describe, it, expect } from "vitest";
import { resolveModels } from "../src/config";

describe("resolveModels", () => {
  it("returns dev models for the dev profile", () => {
    const m = resolveModels("dev");
    expect(m.llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(m.tts).toBe("@cf/myshell-ai/melotts");
    expect(m.embed).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });

  it("returns prod models for the prod profile", () => {
    const m = resolveModels("prod");
    expect(m.llm).toBe("@cf/moonshotai/kimi-k2.6");
    expect(m.tts).toBe("@cf/deepgram/aura-1");
  });

  it("defaults to dev for unknown/empty", () => {
    expect(resolveModels(undefined).llm).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  });
});
