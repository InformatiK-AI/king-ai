// Server-side only
// Template generado por /ai-feature-scaffold — pgvector vector store
// Requiere: CREATE EXTENSION vector; (ver migrations/add_embeddings.sql)
// Con Prisma: usar $queryRaw (pgvector <=> no funciona en queries tipadas de Prisma)
// Con pg raw: usar la query directamente

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata?: {
    sourceId?: string;
    sourceType?: string;
    tenantId?: string; // REQUIRED for multi-tenant
    language?: string;
    createdAt?: string;
    embeddingModel?: string;
  };
}

export interface SimilarityResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStoreOptions {
  threshold?: number; // Min cosine similarity, default 0.70
  topK?: number;      // Results to return, default 20
}

/**
 * pgvector store — requires PostgreSQL with vector extension
 * SECURITY: all queries filter by tenantId — never search across all tenants
 */
export class PgVectorStore {
  constructor(
    // Inject your DB client: pg.Pool, Prisma client, or Drizzle db
    private db: any,
    private tableName = "documents",
  ) {}

  async insert(doc: VectorDocument): Promise<void> {
    // Using pg raw (adapt for Prisma: this.db.$executeRaw`...`)
    await this.db.query(
      `INSERT INTO ${this.tableName} (id, content, embedding, metadata)
       VALUES ($1, $2, $3::vector, $4)
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata`,
      [doc.id, doc.content, JSON.stringify(doc.embedding), JSON.stringify(doc.metadata ?? {})],
    );
  }

  async insertBatch(docs: VectorDocument[]): Promise<void> {
    // For production: use batch insert with pg COPY for large datasets
    await Promise.all(docs.map((doc) => this.insert(doc)));
  }

  async similaritySearch(
    queryEmbedding: number[],
    tenantId: string, // SECURITY: required — never search without tenant filter
    options: VectorStoreOptions = {},
  ): Promise<SimilarityResult[]> {
    const { threshold = 0.7, topK = 20 } = options;

    // SECURITY: tenant_id filter is mandatory
    // 1 - (embedding <=> query_vector) = cosine similarity (pgvector uses distance)
    const result = await this.db.query(
      `SELECT id, content, metadata,
              1 - (embedding <=> $1::vector) AS similarity
       FROM ${this.tableName}
       WHERE (metadata->>'tenantId') = $2
         AND 1 - (embedding <=> $1::vector) >= $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [JSON.stringify(queryEmbedding), tenantId, threshold, topK],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      similarity: parseFloat(row.similarity),
      metadata: row.metadata,
    }));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    // SECURITY: tenantId filter prevents cross-tenant document deletion
    await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND (metadata->>'tenantId') = $2`,
      [id, tenantId],
    );
  }
}
