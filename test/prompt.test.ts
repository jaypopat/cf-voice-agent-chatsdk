import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/brain/prompt";

describe("buildSystemPrompt", () => {
  it("instructs memory grounding with id citations", () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(/search_memory/);
    expect(p).toMatch(/cite/i);
    expect(p).toMatch(/\[id\]/);
  });
});
