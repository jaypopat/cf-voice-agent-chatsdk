import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("VoiceAgent", () => {
  it("wires the withVoice mixin: a Flux transcriber and configured TTS", async () => {
    const stub = env.VoiceAgent.get(env.VoiceAgent.idFromName("test-voice"));
    await runInDurableObject(stub, (instance: unknown) => {
      const agent = instance as {
        transcriber: unknown;
        tts: unknown;
        onTurn: unknown;
      };
      expect(agent.transcriber).toBeDefined();
      expect(agent.tts).toBeDefined();
      expect(typeof agent.onTurn).toBe("function");
    });
  });
});
