import type { VoiceTurnContext } from "@cloudflare/voice";
import { WorkersAIFluxSTT, WorkersAITTS, withVoice } from "@cloudflare/voice";
import { Agent, getAgentByName } from "agents";
import { MODELS } from "../config";

/**
 * Browser-voice ingress. A thin skin over the brain: Flux STT in, Aura TTS out,
 * each completed turn handed to the single AssistantAgent ("main"). The voice
 * mixin owns the audio pipeline and short-term conversation history; this class
 * only routes transcripts to the brain and speaks the reply.
 */
export class VoiceAgent extends withVoice(Agent<Env>) {
  transcriber = new WorkersAIFluxSTT(this.env.AI);
  tts = new WorkersAITTS(this.env.AI, { model: MODELS.tts });

  async onTurn(
    transcript: string,
    _context: VoiceTurnContext
  ): Promise<ReadableStream<Uint8Array>> {
    const brain = await getAgentByName(this.env.AssistantAgent, "main");
    // Streamed reply: the voice pipeline speaks it sentence-by-sentence as tokens
    // arrive, instead of waiting for the whole reply to buffer.
    return await brain.streamReply(transcript);
  }
}
