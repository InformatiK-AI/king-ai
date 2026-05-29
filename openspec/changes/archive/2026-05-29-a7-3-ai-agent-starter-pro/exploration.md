# Exploration — A7.3 ai-agent-starter-pro

> Fase: sdd-explore · Change: a7-3-ai-agent-starter-pro

## Precondición de activación — VERIFICADA

La spec exige los 5 skills M-87 en DONE verificado. Confirmado en `king-ai/skills/`:
`rag-setup/`, `ai-safety/`, `prompt-eval/`, `ai-cost-gate/`, `ai-observability/` (+ cost-report, ai-audit-ledger,
llm-integration, ai-feature-scaffold, judgment-day). Gate de activación SATISFECHO → se lanza la generación.

## Contrato (de la spec, fuente de verdad)

- **Stack FIJO** (no negociable): TypeScript · Vercel AI SDK · Anthropic SDK · pgvector · Postgres · Next.js 15 App Router.
- **Arquitectura de capas** (orden de guardas en el route handler): Safety PRE (PII + jailbreak) → RAG (retrieve pgvector)
  → generación con Cost Gate (circuit breaker → fallback Haiku) + Observability (Langfuse + OTel) → Safety POST (moderation).
- **Layout contractual**: `app/api/chat/route.ts`, `app/page.tsx`, `lib/{rag,safety,cost,observability}/`, `prompts/<n>.vN.md`,
  `eval/golden-set/v1/cases.json`, `tests/ai-safety/adversarial-prompts.json`, `db/migrations/`, `.king/`, `docker-compose.yml`,
  `vercel.json`, `package.json`.
- **4 criterios de aceptación**: (1) `npm run demo` <10s; (2) `npm run eval` golden_set_score≥0.85; (3) `npm run test:safety`
  jailbreak_block_rate≥95%; (4) `npm run build` 0 errores TS.
- **Gates heredados** (`.king/quality-gates.yaml` §ai): cost usd_per_request_p95 0.05, latency p95 3000ms, eval 0.85,
  safety jailbreak 95 / pii_leak 0, observability tracing 100%, enforcement block.
- **DX**: clone → agente RAG funcional en ≤5 pasos.

## Entorno disponible

node v22.14.0 + npm 10.9.2 → `npm install` + `npm run build` (tsc) ejecutables localmente para verificar criterio 4.
ANTHROPIC_API_KEY y Postgres/pgvector NO disponibles → criterios 1-3 quedan como verificación de runtime del usuario.

## Decisión de aproximación

Generar un scaffold **completo y que compila**, con cada capa implementada en TS real (no stubs vacíos): el route handler,
los módulos rag/safety/cost/observability, el golden set y los adversarial prompts de ejemplo, las migraciones SQL, y los
scripts npm. Lo que requiere LLM/DB en vivo (ingest real, demo, eval scoring) queda correctamente cableado y ejecutable,
validado por mí a nivel de tipos/estructura, y por el usuario a nivel runtime con sus credenciales.

## Riesgos

- **R1**: versiones de dependencias (Next 15, ai SDK, @ai-sdk/anthropic, pgvector client) — fijar versiones compatibles y
  verificar `npm install` + `tsc`.
- **R2**: el template debe quedar prístino (sin artefactos de King/openspec dentro) para ser clonable.
- **R3**: criterios 1-3 no verificables sin credenciales → ser explícito en README y verify-report (no afirmar "pasa" lo que no corrí).
