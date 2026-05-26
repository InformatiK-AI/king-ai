// Server-side only
// Template generado por /ai-feature-scaffold
import { EmbeddingClient, cosineSimilarity, hoistQueryWords, keywordOverlap } from "./embedding-client";

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  document: Document;
  similarity: number;
}

export interface SemanticSearchOptions {
  topK?: number;
  threshold?: number; // Minimum cosine similarity (0-1), default 0.70
}

export class SemanticSearch {
  private embedder: EmbeddingClient;
  private documents: Array<Document & { embedding: number[] }> = [];

  constructor(embedder?: EmbeddingClient) {
    this.embedder = embedder ?? new EmbeddingClient();
  }

  async index(documents: Document[]): Promise<void> {
    const embeddings = await this.embedder.embedBatch(documents.map((d) => d.content));
    this.documents = documents.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i]!.embedding,
    }));
  }

  async search(query: string, options: SemanticSearchOptions = {}): Promise<SearchResult[]> {
    const { topK = 5, threshold = 0.7 } = options;

    const queryEmbedding = await this.embedder.embed(query);

    // Hoist invariant: queryWords computed once, not inside each sort comparison.
    const queryWords = hoistQueryWords(query);

    // Schwartzian transform: decorate → sort → undecorate.
    // Avoids recomputing keyword overlap O(d log d) times during sort.
    return this.documents
      .map((doc) => {
        const similarity = cosineSimilarity(queryEmbedding.embedding, doc.embedding);
        if (similarity < threshold) return null; // Early exit before keyword score
        const keyword = keywordOverlap(queryWords, doc.content);
        return {
          document: { id: doc.id, content: doc.content, metadata: doc.metadata },
          similarity,
          score: similarity * 0.8 + keyword * 0.2,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ document, similarity }) => ({ document, similarity }));
  }
}
