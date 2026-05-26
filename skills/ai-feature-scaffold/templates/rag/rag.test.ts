// Template de test — generado por /ai-feature-scaffold
const mockSimilaritySearch = jest.fn();
const mockEmbed = jest.fn();

jest.mock("./pgvector-store", () => ({
  PgVectorStore: jest.fn().mockImplementation(() => ({
    similaritySearch: mockSimilaritySearch,
  })),
}));

jest.mock("../semantic-search/embedding-client", () => ({
  EmbeddingClient: jest.fn().mockImplementation(() => ({
    embed: mockEmbed,
  })),
}));

import { RAGPipeline } from "./rag-pipeline-claude";

const mockVectorStore = { similaritySearch: mockSimilaritySearch };
const mockEmbedder = { embed: mockEmbed };

describe("RAGPipeline", () => {
  const tenantId = "tenant-123";

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], tokenCount: 10, costUsd: 0 });
  });

  it("includes retrieved documents in context", async () => {
    mockSimilaritySearch.mockResolvedValue([
      { id: "doc1", content: "Relevant document content", similarity: 0.95 },
    ]);

    const pipeline = new RAGPipeline(mockVectorStore as any, mockEmbedder as any);
    const result = await pipeline.query("user question", tenantId);

    expect(result.sources).toContain("doc1");
  });

  it("passes tenantId to similarity search (SECURITY check)", async () => {
    mockSimilaritySearch.mockResolvedValue([]);

    const pipeline = new RAGPipeline(mockVectorStore as any, mockEmbedder as any);
    await pipeline.query("query", tenantId);

    expect(mockSimilaritySearch).toHaveBeenCalledWith(
      expect.any(Array),
      tenantId, // SECURITY: tenantId must be passed
      expect.any(Object),
    );
  });

  it("returns result even with no documents retrieved (fallback)", async () => {
    mockSimilaritySearch.mockResolvedValue([]);

    const pipeline = new RAGPipeline(mockVectorStore as any, mockEmbedder as any);
    const result = await pipeline.query("query", tenantId);

    expect(result).toBeDefined();
    expect(result.answer).toBeDefined();
    expect(result.sources).toHaveLength(0);
  });

  it("logs latency metrics for observability (AC-3)", async () => {
    mockSimilaritySearch.mockResolvedValue([]);
    const consoleSpy = jest.spyOn(console, "log");

    const pipeline = new RAGPipeline(mockVectorStore as any, mockEmbedder as any);
    await pipeline.query("query", tenantId);

    const logCall = consoleSpy.mock.calls.find((c) =>
      JSON.stringify(c).includes("rag_query"),
    );
    expect(logCall).toBeDefined();
    const logData = JSON.parse(logCall![0]);
    expect(logData).toHaveProperty("retrieveMs");
    expect(logData).toHaveProperty("totalMs");
  });
});
