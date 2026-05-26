-- Migration: add vector embeddings support
-- Run ONCE in your PostgreSQL database
-- Requires: PostgreSQL 14+ with pgvector extension

-- Install pgvector extension (requires superuser or pg_extension_owner)
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table for RAG
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  content      TEXT NOT NULL,

  -- Vector embedding (dimensions must match your embedding model)
  -- text-embedding-3-small: 1536 dims (or 256 if using dimensionality reduction)
  -- text-embedding-004 (Gemini): 768 dims
  embedding    vector(1536) NOT NULL,

  -- Metadata (JSONB for flexible schema)
  -- Required fields: tenantId (for multi-tenant), embeddingModel (for migrations)
  metadata     JSONB DEFAULT '{}'::jsonb,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for approximate nearest neighbor search
-- ef_construction: higher = better recall but slower indexing (default 64)
-- m: max connections per layer (default 16)
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx
  ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for tenant-scoped queries (critical for multi-tenant RLS)
CREATE INDEX IF NOT EXISTS documents_tenant_idx
  ON documents ((metadata->>'tenantId'));

-- Optional: Row-Level Security
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY documents_tenant_policy ON documents
--   USING ((metadata->>'tenantId') = current_setting('app.tenant_id'));

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
