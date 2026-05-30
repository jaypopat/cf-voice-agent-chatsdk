export interface VectorMatch {
  id: string;
  score: number;
  snippet: string;
  kind: string;
  created_at: number;
}

interface EmbeddingResponse { shape: number[]; data: number[][]; }

export class VectorIndex {
  constructor(
    private ai: Ai,
    private vz: VectorizeIndex,
    private embedModel: string,
  ) {}

  private async embed(text: string): Promise<number[]> {
    const r = (await this.ai.run(this.embedModel, { text: [text] })) as unknown as EmbeddingResponse;
    return r.data[0];
  }

  async upsertMemory(m: { id: string; text: string; kind: string; created_at: number }): Promise<void> {
    const values = await this.embed(m.text);
    await this.vz.upsert([
      { id: m.id, values, metadata: { snippet: m.text.slice(0, 512), kind: m.kind, created_at: m.created_at } },
    ]);
  }

  async query(text: string, topK: number): Promise<VectorMatch[]> {
    const v = await this.embed(text);
    const res = await this.vz.query(v, { topK, returnMetadata: "all" });
    return res.matches.map((m: any) => ({
      id: m.id,
      score: m.score,
      snippet: String(m.metadata?.snippet ?? ""),
      kind: String(m.metadata?.kind ?? ""),
      created_at: Number(m.metadata?.created_at ?? 0),
    }));
  }
}
