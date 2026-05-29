# Proposal — A7.3 Generar ai-agent-starter-pro

> Fase: sdd-propose · Change: a7-3-ai-agent-starter-pro · Backend: openspec (king-ai) · Backlog: A7.3 (front-runner desbloqueado)

## Why

A7.3 es el único de los 4 productos diferidos post-M13 con la precondición de activación **cumplida**: los 5 skills
M-87 (`/rag-setup`, `/ai-safety`, `/prompt-eval`, `/ai-cost-gate`, `/ai-observability`) están DONE en `king-ai/skills/`.
La spec (`king-ai/knowledge/domain/ai-agent-starter-pro-spec.md`) define el contrato completo del template; este cambio
**lo materializa** como repositorio standalone.

El template es la pieza de referencia del plugin king-ai y el consumidor downstream es M14 (marketplace de templates):
un starter productivo que demuestra RAG + safety + evals + observability + cost-gate integrados y desplegable a Vercel.

## What Changes

Se crea el **repo nuevo** `ai-agent-starter-pro` (TypeScript · Next.js 15 App Router · Vercel AI SDK · Anthropic SDK ·
pgvector · Postgres) replicando el layout contractual de la spec. king-ai no cambia salvo el bootstrap de su `openspec/`
(este planning). El template queda **prístino** (sin openspec de King dentro) para que los devs lo clonen limpio.

## Capabilities (contrato para sdd-spec)

| # | Capability | Artefactos |
|---|------------|------------|
| 1 | `repo-scaffold` | Estructura contractual: `app/`, `lib/{rag,safety,cost,observability}`, `prompts/`, `eval/golden-set`, `tests/ai-safety`, `db/migrations`, `.king/`, `docker-compose.yml`, `vercel.json`, `package.json`, `.env.example`, `README.md` |
| 2 | `rag-pipeline` | `lib/rag/`: ingest + chunking + retrieve sobre pgvector; endpoint streaming `app/api/chat/route.ts` (orden de guardas safety→RAG→cost→observability→safety) |
| 3 | `safety-layer` | `lib/safety/`: `guardInput` (PII redaction + jailbreak block) y `guardOutput` (moderation) + `tests/ai-safety/adversarial-prompts.json` |
| 4 | `cost-observability` | `lib/cost/` (cost gate + circuit breaker → fallback Haiku) + `lib/observability/` (Langfuse client + OTel spans) |
| 5 | `eval-harness` | `eval/golden-set/v1/cases.json` + runner `npm run eval` (golden_set_score) |
| 6 | `gates-and-build` | `.king/quality-gates.yaml` (sección `ai:` heredada) + `tsconfig` estricto + scripts npm (demo/eval/test:safety/build/ingest/db:migrate) |

## Scope

- **In scope**: generar el repo standalone completo y **type-check limpio** (criterio 4: `npm run build` 0 errores TS);
  conformidad con el layout contractual; los 4 scripts de aceptación presentes y ejecutables; `.env.example`,
  `docker-compose.yml` (Postgres+pgvector), `vercel.json`, README con los ≤5 pasos de setup; `git init` + commit inicial.
- **Out of scope (runtime — requiere entorno del usuario)**: validar criterios 1-3 (`npm run demo` <10s, `npm run eval`
  golden_set_score≥0.85, `npm run test:safety` jailbreak≥95%) — requieren `ANTHROPIC_API_KEY` + Postgres/pgvector reales.
  Se entregan ejecutables y documentados; su verificación de runtime queda para el usuario.
- **Out of scope**: publicar el repo en GitHub (`king-framework/ai-agent-starter-pro`) y registrarlo en M14 marketplace
  → diferido a confirmación del usuario (outward-facing).

## Affected modules

- **Nuevo**: `D:\King Framework\ai-agent-starter-pro\` (repo independiente).
- `king-ai/openspec/` (bootstrap, este planning) — único cambio a king-ai.

## Delivery

- Repo nuevo con commit inicial. La generación es grande (~30-40 archivos TS) → APPLY vía Workflow fan-out por módulo
  (patrón M03/M04), con type-check incremental.
- Push/registro en marketplace → diferido a confirmación del usuario.

## Rollback plan

- El repo es nuevo y aislado: revertir = borrar `D:\King Framework\ai-agent-starter-pro\`. No afecta ningún plugin.
- El bootstrap de `king-ai/openspec/` es aditivo: revertir = borrar el dir. king-ai funciona igual sin él.
