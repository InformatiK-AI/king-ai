# Tasks — A7.3 ai-agent-starter-pro

> Fase: sdd-tasks · Agrupadas por módulo del layout contractual.

## Bloque B0 — Root config
- [ ] B0.1 Crear dir `D:/King Framework/ai-agent-starter-pro/` + `git init`.
- [ ] B0.2 `package.json` (deps fijadas + 6 scripts: dev/build/demo/eval/test:safety/ingest/db:migrate).
- [ ] B0.3 `tsconfig.json` (strict), `next.config.mjs`, `.gitignore`, `.env.example` (ANTHROPIC_API_KEY, DATABASE_URL).
- [ ] B0.4 `docker-compose.yml` (Postgres + pgvector), `vercel.json`, `README.md` (≤5 pasos), `.king/quality-gates.yaml`.

## Bloque B1 — RAG (lib/rag)
- [ ] B1.1 `db.ts` (pool pg), `embeddings.ts` (transformers.js all-MiniLM-L6-v2, 384d).
- [ ] B1.2 `chunk.ts` (chunking), `ingest.ts` (doc→chunks→embeddings→pgvector), `retrieve.ts` (similarity topK + citaciones), `index.ts`.

## Bloque B2 — Safety (lib/safety)
- [ ] B2.1 `pii.ts` (redaction regex), `jailbreak.ts` (patrones OWASP LLM), `moderation.ts` (post-output), `index.ts` (guardInput/guardOutput).

## Bloque B3 — Cost + Observability
- [ ] B3.1 `lib/cost/index.ts` (withCostGate + circuit breaker + fallback Haiku).
- [ ] B3.2 `lib/observability/{langfuse-client.ts,otel.ts,index.ts}` (withObservability, no-op sin creds).

## Bloque B4 — App (Next.js)
- [ ] B4.1 `app/layout.tsx`, `app/page.tsx` (UI demo mínima).
- [ ] B4.2 `app/api/chat/route.ts` (orden de guardas: guardInput→retrieve→withObservability(withCostGate(streamText))→guardOutput).
- [ ] B4.3 `prompts/system.v1.md`.

## Bloque B5 — Eval + Safety tests + DB + scripts
- [ ] B5.1 `eval/golden-set/v1/cases.json` + `scripts/eval.ts` (golden_set_score).
- [ ] B5.2 `tests/ai-safety/adversarial-prompts.json` + `scripts/safety-test.ts` (jailbreak_block_rate).
- [ ] B5.3 `db/migrations/0001_init.sql` (pgvector + documents/chunks/evals/audit) + `scripts/migrate.ts`.
- [ ] B5.4 `scripts/{demo.ts,ingest.ts}` + `data/sample/*.md`.

## Bloque B6 — VERIFY (verificable)
- [ ] B6.1 `npm install` OK.
- [ ] B6.2 `npm run build` → 0 errores TS (criterio 4).
- [ ] B6.3 Conformidad estructural (layout contractual) + parse de `.king/quality-gates.yaml`.
- [ ] B6.4 Documentar criterios 1-3 como pendientes de runtime del usuario (verify-report honesto).

## Bloque B7 — ARCHIVE
- [ ] B7.1 Commit inicial en ai-agent-starter-pro; commit del planning en king-ai (openspec).
- [ ] B7.2 Archivar change; actualizar state.yaml + memoria.
- [ ] B7.3 Push GitHub + registro marketplace M14 → DIFERIDO a confirmación del usuario.
