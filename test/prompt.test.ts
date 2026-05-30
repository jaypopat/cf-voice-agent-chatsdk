import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/brain/prompt";

const SEARCH_MEMORY = /search_memory/;
const CITE = /cite/i;
const ID_CITATION = /\[id\]/;

describe("buildSystemPrompt", () => {
  it("instructs memory grounding with id citations", () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(SEARCH_MEMORY);
    expect(p).toMatch(CITE);
    expect(p).toMatch(ID_CITATION);
  });
});
