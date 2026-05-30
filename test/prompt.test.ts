import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/brain/prompt";

describe("buildSystemPrompt", () => {
  it("includes the channel and citation instruction", () => {
    const p = buildSystemPrompt("voice");
    expect(p).toMatch(/voice/i);
    expect(p).toMatch(/cite/i);
    expect(p).toMatch(/\[id\]/);
  });
  it("tells voice to keep replies short", () => {
    expect(buildSystemPrompt("voice")).toMatch(/short|concise|brief/i);
  });
  it("handles telegram channel", () => {
    expect(buildSystemPrompt("telegram")).toMatch(/telegram/i);
  });
});
