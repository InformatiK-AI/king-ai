// Server-side only
// Template generado por /ai-feature-scaffold — Weaviate vector store
// Install: npm install weaviate-client
import weaviate, { type WeaviateClient } from "weaviate-client";
import { SimilarityResult, VectorDocument, VectorStoreOptions } from "./pgvector-store";

export class WeaviateStore {
  private client!: WeaviateClient;
  private className: string;

  constructor(className = "Document") {
    this.className = className;
  }

  async connect(): Promise<void> {
    if (!process.env.WEAVIATE_URL) throw new Error("WEAVIATE_URL required");
    this.client = await weaviate.connectToCustom({
      httpHost: process.env.WEAVIATE_URL,
      httpPort: 443,
      httpSecure: true,
      grpcHost: process.env.WEAVIATE_GRPC_HOST ?? process.env.WEAVIATE_URL,
      grpcPort: 443,
      grpcSecure: true,
      auth: process.env.WEAVIATE_API_KEY
        ? weaviate.ApiKey(process.env.WEAVIATE_API_KEY)
        : undefined,
    });
  }

  async insert(doc: VectorDocument): Promise<void> {
    const collection = this.client.collections.get(this.className);
    await collection.data.insert({
      id: doc.id,
      properties: { content: doc.content, ...doc.metadata },
      vectors: doc.embedding,
    });
  }

  async similaritySearch(
    queryEmbedding: number[],
    tenantId: string,
    options: VectorStoreOptions = {},
  ): Promise<SimilarityResult[]> {
    const { threshold = 0.7, topK = 20 } = options;
    const collection = this.client.collections.get(this.className);

    const result = await collection.query.nearVector(queryEmbedding, {
      limit: topK,
      certainty: threshold,
      returnMetadata: ["certainty"],
      // SECURITY: filter by tenantId
      filters: collection.filter.byProperty("tenantId").equal(tenantId),
    });

    return result.objects.map((obj) => ({
      id: obj.uuid,
      content: String(obj.properties.content ?? ""),
      similarity: obj.metadata?.certainty ?? 0,
      metadata: obj.properties as Record<string, unknown>,
    }));
  }
}
