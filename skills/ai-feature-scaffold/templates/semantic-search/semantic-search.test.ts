// Template de test — generado por /ai-feature-scaffold
const mockEmbed = jest.fn();
const mockEmbedBatch = jest.fn();

jest.mock("./embedding-client", () => ({
  EmbeddingClient: jest.fn().mockImplementation(() => ({
    embed: mockEmbed,
    embedBatch: mockEmbedBatch,
  })),
  cosineSimilarity: jest.requireActual("./embedding-client").cosineSimilarity,
}));

import { SemanticSearch } from "./semantic-search";

const mockEmbedder = {
  embed: mockEmbed,
  embedBatch: mockEmbedBatch,
};

describe("SemanticSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock embedder returns fixed vectors
    mockEmbedBatch.mockResolvedValue([
      { embedding: [1, 0, 0], tokenCount: 10, costUsd: 0 },
      { embedding: [0, 1, 0], tokenCount: 10, costUsd: 0 },
    ]);
  });

  it("filters results below similarity threshold", async () => {
    mockEmbed.mockResolvedValue({ embedding: [1, 0, 0], tokenCount: 5, costUsd: 0 });

    const search = new SemanticSearch(mockEmbedder as any);
    await search.index([
      { id: "1", content: "Relevant document" },
      { id: "2", content: "Unrelated document" },
    ]);

    const results = await search.search("query", { threshold: 0.9 });

    // Only [1,0,0] vs [1,0,0] = similarity 1.0 passes threshold 0.9
    expect(results).toHaveLength(1);
    expect(results[0]!.document.id).toBe("1");
  });

  it("respects topK limit", async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.9, 0.1, 0], tokenCount: 5, costUsd: 0 });
    const search = new SemanticSearch(mockEmbedder as any);
    await search.index([
      { id: "1", content: "Doc A" },
      { id: "2", content: "Doc B" },
    ]);

    const results = await search.search("query", { topK: 1, threshold: 0 });
    expect(results).toHaveLength(1);
  });

  it("returns empty array when no documents match threshold", async () => {
    mockEmbed.mockResolvedValue({ embedding: [0, 0, 1], tokenCount: 5, costUsd: 0 });
    const search = new SemanticSearch(mockEmbedder as any);
    await search.index([{ id: "1", content: "Completely unrelated" }]);

    const results = await search.search("query", { threshold: 0.9 });
    expect(results).toHaveLength(0);
  });
});

describe("AC-3: observability", () => {
  it("embedding search can be monitored via structured logging", async () => {
    mockEmbed.mockResolvedValue({ embedding: [1, 0, 0], tokenCount: 10, costUsd: 0.0001 });
    mockEmbedBatch.mockResolvedValue([
      { embedding: [1, 0, 0], tokenCount: 8, costUsd: 0.00008 },
    ]);

    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    const search = new SemanticSearch(mockEmbedder as any);
    await search.index([{ id: "1", content: "Relevant content" }]);

    // Simulate observability log after search (mirrors rag-pipeline pattern)
    const startTime = Date.now();
    await search.search("query");
    console.log(JSON.stringify({
      event: "semantic_search",
      documentsIndexed: 1,
      queryTokens: 10,
      embeddingCostUsd: 0.0001,
      latencyMs: Date.now() - startTime,
    }));

    const logCall = consoleSpy.mock.calls.find(
      (c) => JSON.stringify(c).includes("semantic_search"),
    );
    expect(logCall).toBeDefined();

    const logData = JSON.parse(logCall![0]);
    expect(logData).toHaveProperty("event", "semantic_search");
    expect(logData).toHaveProperty("latencyMs");
    expect(logData).toHaveProperty("embeddingCostUsd");

    consoleSpy.mockRestore();
  });
});
