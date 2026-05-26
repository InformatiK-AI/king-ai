// Server-side only
// Template generado por /ai-feature-scaffold
// NOTE: Claude does not support embeddings. Using OpenAI (default) or Gemini.
// Install: npm install openai (or @google/generative-ai for Gemini)

import OpenAI from "openai";
export { hoistQueryWords, keywordOverlap } from "./ranking-utils";

// OpenAI embedding dimensions — reducible for pgvector index size optimization
// text-embedding-3-small supports dimensions: 256, 512, 1536 (default)
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS ?? "1536", 10);
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

// UPDATE REGULARLY — check https://openai.com/pricing
const EMBEDDING_PRICING: Record<string, number> = {
  "text-embedding-3-small": 0.02, // USD per 1M tokens
  "text-embedding-3-large": 0.13,
  "text-embedding-004": 0, // Google Gemini — free tier
};

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
  costUsd: number;
}

export class EmbeddingClient {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY required for embeddings. Claude does not support embeddings — use OpenAI or Gemini.",
      );
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Truncate text to avoid exceeding token limits (8191 tokens for text-embedding-3-small)
    const truncated = text.slice(0, 32000); // ~8k tokens at average 4 chars/token

    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS, // Reduce to 256 for smaller pgvector index
    });

    const tokenCount = response.usage.total_tokens;
    const costUsd = (tokenCount * (EMBEDDING_PRICING[EMBEDDING_MODEL] ?? 0)) / 1_000_000;

    return {
      embedding: response.data[0].embedding,
      tokenCount,
      costUsd,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.slice(0, 32000)),
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data.map((item, i) => ({
      embedding: item.embedding,
      tokenCount: Math.round(response.usage.total_tokens / texts.length), // Approximate per-text
      costUsd: (response.usage.total_tokens * (EMBEDDING_PRICING[EMBEDDING_MODEL] ?? 0)) / texts.length / 1_000_000,
    }));
  }
}

// Single-pass: computes dot, magA², magB² in one loop instead of three reduce() calls.
// For v=1536 dims × d=1000 docs: 4,608,000 → 1,536,000 operations (3× faster).
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Embedding dimension mismatch");
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
