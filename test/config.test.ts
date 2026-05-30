import { describe, expect, it } from "vitest";
import { MODELS } from "../src/config";

describe("MODELS", () => {
  it("defines a non-empty model id for every role", () => {
    for (const key of ["llm", "tts", "embed"] as const) {
      expect(typeof MODELS[key]).toBe("string");
      expect(MODELS[key].length).toBeGreaterThan(0);
    }
  });
});
