-- Migration: webhook_dedup (idempotencia de webhooks entrantes)
-- Run ONCE in your PostgreSQL database
--
-- Meta (y otros canales) reintentan los POST si no reciben 200 a tiempo. La PK sobre message_id da
-- exclusión mutua atómica (INSERT ... ON CONFLICT DO NOTHING) sin Redis. Ver idempotency.ts.
CREATE TABLE IF NOT EXISTS webhook_dedup (
  message_id   TEXT PRIMARY KEY,
  channel      TEXT NOT NULL DEFAULT 'whatsapp',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para el GC perezoso por antigüedad (ver idempotency.ts → gcDedup).
CREATE INDEX IF NOT EXISTS webhook_dedup_processed_at_idx ON webhook_dedup (processed_at);
