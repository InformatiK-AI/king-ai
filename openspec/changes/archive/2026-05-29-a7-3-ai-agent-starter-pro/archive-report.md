# Archive Report — A7.3 ai-agent-starter-pro

> Fecha: 2026-05-29 · Verdict: CONDITIONAL · Deliverable: repo standalone ai-agent-starter-pro

## Resumen

Generado el repositorio template `ai-agent-starter-pro` (primer producto desbloqueado del backlog A7) desde su spec,
vía ciclo SDD completo. Stack: TypeScript · Next.js 15 App Router · Vercel AI SDK v4 · Anthropic SDK · pgvector ·
embeddings locales (transformers.js). 37 archivos versionables, ~30 de código/config.

## Entregado

- **Repo nuevo** `D:/King Framework/ai-agent-starter-pro` (git init): app Next.js (route handler con orden de guardas
  safety→rag→cost+obs→safety + UI demo), `lib/{rag,safety,cost,observability}`, prompts versionados, golden set,
  adversarial prompts, migración pgvector, scripts (migrate/ingest/demo/eval/test:safety), docker-compose, vercel.json,
  `.king/quality-gates.yaml`, README con setup ≤5 pasos.
- **king-ai/openspec/** bootstrapeado (config.yaml + change a7-3 con propose/spec/design/tasks/verify/archive).

## Verificación

- ✅ Criterio 4 (build 0 errores TS) y criterio 3 (jailbreak 100%) — verificados por mí.
- ⏳ Criterios 1-2 (demo <10s, eval ≥0.85) — requieren ANTHROPIC_API_KEY + Postgres/pgvector del usuario.
- Iteración honesta: safety 90%→100% arreglando el detector (no el test).

## Decisiones clave
Embeddings locales (contrato 2-env-vars), observability dependency-free, cost gate con fallback Haiku,
serverExternalPackages para build limpio. Template prístino (sin openspec de King dentro; el planning vive en king-ai).

## Pendiente (outward-facing — confirmación del usuario)
- Crear repo remoto `InformatiK-AI/ai-agent-starter-pro` + push.
- Validación de runtime (criterios 1-2) con credenciales → sube CASTLE a FORTIFIED.
- Registro en marketplace M14 de templates.

## Backlog A7 restante
A7.1 (King Hub backend), A7.2 (plataforma de exámenes), A7.4 (NEXUS — bloqueado por Engram sqlite-vec). Ver
`mejora/planes-detallados/A7-deferred-products-backlog.md`.
