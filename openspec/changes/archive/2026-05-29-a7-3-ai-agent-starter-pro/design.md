# Design — A7.3 ai-agent-starter-pro

> Fase: sdd-design · Fuente de verdad: king-ai/knowledge/domain/ai-agent-starter-pro-spec.md

## Decisiones de arquitectura

### D1 — Embeddings locales (transformers.js), NO un 2º API key
La spec promete setup en ≤5 pasos editando SOLO `ANTHROPIC_API_KEY` + `DATABASE_URL`. Anthropic NO ofrece embeddings.
Para no romper ese contrato (no exigir un 3er key tipo Voyage/OpenAI), los embeddings se generan **localmente** con
`@xenova/transformers` (modelo `all-MiniLM-L6-v2`, 384 dims). Generación de texto = Anthropic (Claude). Trade-off:
primer run descarga el modelo (~cold start); luego cachea. Documentado en README. Esto honra el contrato de 2 env vars.

### D2 — Stack y versiones fijadas
Next.js 15 + React 19 (App Router) · `ai` (Vercel AI SDK v4) + `@ai-sdk/anthropic` · `pg` + extensión pgvector ·
`zod` (structured outputs) · TypeScript estricto · `vitest` (tests). Versiones pineadas en package.json y validadas con
`npm install` + `npm run build`.

### D3 — Cost gate y circuit breaker
`lib/cost/withCostGate`: estima costo por request (tokens × precio), corta si supera budget (usd_per_request_p95 0.05),
y ante fallo/sobrecosto hace fallback de `claude-sonnet` → `claude-haiku`. Circuit breaker simple en memoria (contador
de fallos + cooldown).

### D4 — Observability dual (Langfuse + OTel), no-op sin credenciales
`lib/observability/withObservability`: si hay `LANGFUSE_*`/OTel endpoint, emite trazas; si no, **no-op tipado** (no rompe
el demo sin observabilidad configurada). tracing_coverage_pct 100 se cumple porque TODA generación pasa por el wrapper.

### D5 — Template prístino
El repo NO contiene openspec/ ni artefactos de King. Solo `.king/quality-gates.yaml` (que la spec exige heredar) +
contenido del template. El planning SDD vive en king-ai/openspec.

## Mapa de archivos (layout contractual → implementación)

```
ai-agent-starter-pro/
├── package.json            # scripts: dev, build, demo, eval, test:safety, ingest, db:migrate
├── tsconfig.json           # strict: true
├── next.config.mjs · .gitignore · .env.example · README.md · vercel.json · docker-compose.yml
├── .king/quality-gates.yaml     # sección ai: (gates heredados)
├── app/
│   ├── layout.tsx · page.tsx     # UI mínima de demo
│   └── api/chat/route.ts         # orden de guardas safety→rag→cost+obs→safety
├── lib/
│   ├── rag/{db.ts,embeddings.ts,chunk.ts,ingest.ts,retrieve.ts,index.ts}
│   ├── safety/{pii.ts,jailbreak.ts,moderation.ts,index.ts}
│   ├── cost/index.ts             # withCostGate + circuit breaker + fallback Haiku
│   └── observability/{langfuse-client.ts,otel.ts,index.ts}
├── prompts/system.v1.md          # prompt versionado
├── eval/golden-set/v1/cases.json # golden set
├── tests/ai-safety/adversarial-prompts.json
├── scripts/{demo.ts,ingest.ts,migrate.ts,eval.ts,safety-test.ts}
├── db/migrations/0001_init.sql   # extensión pgvector + documents/chunks/evals/audit
└── data/sample/*.md              # dataset de ejemplo para ingest
```

## Estrategia de verificación (alineada al scope)
- **Verificable por mí**: `npm install`, `npm run build` (criterio 4: 0 errores TS), conformidad estructural, parse de gates.
- **Runtime del usuario**: `npm run demo`/`eval`/`test:safety` (criterios 1-3) — requieren ANTHROPIC_API_KEY + Postgres/pgvector.
  El verify-report los marca "pendiente de runtime", nunca "PASS" sin correrlos.

## Generación (APPLY)
~30 archivos. Se genera con Workflow fan-out por módulo (root config · app · lib/rag · lib/safety · lib/cost ·
lib/observability · eval+safety · db+scripts), seguido de `npm install` + `npm run build` para cerrar el type-check.
