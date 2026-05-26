// Server-side only
// Template generado por /ai-feature-scaffold — Pinecone vector store
// Install: npm install @pinecone-database/pinecone
import { Pinecone } from "@pinecone-database/pinecone";
import { SimilarityResult, VectorDocument, VectorStoreOptions } from "./pgvector-store";

export class PineconeStore {
  private client: Pinecone;
  private indexName: string;

  constructor() {
    if (!process.env.PINECONE_API_KEY) throw new Error("PINECONE_API_KEY required");
    if (!process.env.PINECONE_INDEX) throw new Error("PINECONE_INDEX required");
    this.client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    this.indexName = process.env.PINECONE_INDEX;
  }

  async insert(doc: VectorDocument): Promise<void> {
    const index = this.client.index(this.indexName);
    await index.upsert([{
      id: doc.id,
      values: doc.embedding,
      metadata: { content: doc.content, ...(doc.metadata ?? {}) },
    }]);
  }

  async similaritySearch(
    queryEmbedding: number[],
    tenantId: string, // SECURITY: filter by namespace or metadata
    options: VectorStoreOptions = {},
  ): Promise<SimilarityResult[]> {
    const { threshold = 0.7, topK = 20 } = options;
    const index = this.client.index(this.indexName);

    const response = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      // SECURITY: filter by tenantId in metadata
      filter: { tenantId: { $eq: tenantId } },
    });

    return (response.matches ?? [])
      .filter((m) => (m.score ?? 0) >= threshold)
      .map((m) => ({
        id: m.id,
        content: String(m.metadata?.content ?? ""),
        similarity: m.score ?? 0,
        metadata: m.metadata as Record<string, unknown>,
      }));
  }
}
