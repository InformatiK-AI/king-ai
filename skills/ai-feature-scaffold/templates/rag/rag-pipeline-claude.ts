// Server-side only
// Template generado por /ai-feature-scaffold — RAG pipeline con Claude
// Flujo: Retrieve → Rerank → Augment → Generate

import { PgVectorStore } from "./pgvector-store"; // or pinecone-store / weaviate-store
import { EmbeddingClient, hoistQueryWords, keywordOverlap } from "../semantic-search/embedding-client";
// TODO: importar tu cliente LLM
// import { ClaudeClient } from "@/lib/llm/claude-client";

export interface RAGOptions {
  topK?: number;        // Initial retrieval count (reranked down to topKFinal)
  topKFinal?: number;   // Documents sent to LLM after reranking
  threshold?: number;   // Min similarity score (0-1)
  maxContextTokens?: number; // Token budget for RAG context
}

export interface RAGResult {
  answer: string;
  sources: string[];  // Document IDs used in context
  latencyMs: { retrieve: number; generate: number; total: number };
}

/**
 * 4-step RAG pipeline: Retrieve → Rerank → Augment → Generate
 * SECURITY: tenantId required — never search across all tenants
 */
export class RAGPipeline {
  constructor(
    private vectorStore: PgVectorStore,
    private embedder: EmbeddingClient,
    // private llmClient: ClaudeClient, // TODO: inject your LLM client
    private options: RAGOptions = {},
  ) {}

  async query(userQuery: string, tenantId: string): Promise<RAGResult> {
    const startTotal = Date.now();
    const opts = {
      topK: this.options.topK ?? 20,
      topKFinal: this.options.topKFinal ?? 5,
      threshold: this.options.threshold ?? 0.7,
      maxContextTokens: this.options.maxContextTokens ?? 4000,
    };

    // STEP 1: Retrieve
    const retrieveStart = Date.now();
    const queryEmbedding = await this.embedder.embed(userQuery);
    const candidates = await this.vectorStore.similaritySearch(
      queryEmbedding.embedding,
      tenantId, // SECURITY: always pass tenantId
      { topK: opts.topK, threshold: opts.threshold },
    );
    const retrieveMs = Date.now() - retrieveStart;

    // STEP 2: Rerank — combine vector similarity + keyword overlap
    const reranked = this.rerank(userQuery, candidates).slice(0, opts.topKFinal);

    // STEP 3: Augment — build context with token budget
    const context = this.buildContext(reranked, opts.maxContextTokens);

    // STEP 4: Generate
    const generateStart = Date.now();
    const systemPrompt = [
      "You are a helpful assistant. Answer questions based ONLY on the provided context.",
      "If the context doesn't contain the answer, say so clearly.",
      "Do not make up information.",
    ].join("\n");

    const contextPrompt = context
      ? `<context>\n${context}\n</context>\n\nUser question: ${userQuery}`
      : userQuery;

    // TODO: replace placeholder with actual LLM call
    // const result = await this.llmClient.complete([
    //   { role: "user", content: contextPrompt }
    // ]);
    const answer = `[LLM not configured — run /llm-integration first]\n\nContext retrieved:\n${context.slice(0, 200)}...`;
    const generateMs = Date.now() - generateStart;

    // NOTE: tenantId must be an opaque identifier (UUID/internal ID), never PII (email, name).
    // AC-3: log observability — uncomment token/cost fields once llmClient is wired up
    console.log(JSON.stringify({
      event: "rag_query",
      tenantId,
      candidatesRetrieved: candidates.length,
      documentsUsed: reranked.length,
      retrieveMs,
      generateMs,
      totalMs: Date.now() - startTotal,
      // inputTokens: result.usage.inputTokens,   // uncomment after wiring llmClient
      // outputTokens: result.usage.outputTokens, // uncomment after wiring llmClient
      // costUsd: this.llmClient.calculateCostUSD(result.usage), // uncomment after wiring llmClient
    }));

    return {
      answer,
      sources: reranked.map((r) => r.id),
      latencyMs: { retrieve: retrieveMs, generate: generateMs, total: Date.now() - startTotal },
    };
  }

  private rerank(query: string, candidates: any[]): any[] {
    // Hoist invariant: queryWords computed once, reused across all candidates.
    const queryWords = hoistQueryWords(query);
    return candidates
      .map((c) => ({ ...c, score: c.similarity * 0.8 + keywordOverlap(queryWords, c.content) * 0.2 }))
      .sort((a, b) => b.score - a.score);
  }

  private buildContext(docs: any[], maxTokens: number): string {
    // Approximate token budget: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    let totalChars = 0;
    const selected: string[] = [];

    for (const doc of docs) {
      if (totalChars + doc.content.length > maxChars) break;
      // XML delimiter for Claude — reduces ambiguity vs markdown
      selected.push(`<document index="${selected.length + 1}">\n${doc.content}\n</document>`);
      totalChars += doc.content.length;
    }

    return selected.join("\n\n");
  }
}
