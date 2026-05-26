// Shared ranking utilities for semantic search and RAG reranking.
// Provider-agnostic — no dependency on EmbeddingClient or any LLM SDK.

/** Pre-computes the query word set once per search call (invariant hoist). */
export function hoistQueryWords(query: string): Set<string> {
  return new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
}

/**
 * Keyword overlap score [0-1] between a pre-computed query word set and a document.
 * Uses for-of over Set to avoid spread-to-Array allocation.
 */
export function keywordOverlap(queryWords: Set<string>, text: string): number {
  if (queryWords.size === 0) return 0;
  const textWords = new Set(text.toLowerCase().split(/\s+/));
  let matches = 0;
  for (const w of queryWords) if (textWords.has(w)) matches++;
  return matches / queryWords.size;
}
