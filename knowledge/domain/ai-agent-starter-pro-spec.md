# `ai-agent-starter-pro` Template Spec

> **NOTA — Esto es la ESPECIFICACIÓN del template, no el template.**
> Este documento define el contrato del repositorio `ai-agent-starter-pro`: stack,
> features, criterios de activación y de testing. El **repositorio en sí está FUERA
> de scope de M03**: se genera como tarea separada únicamente cuando los 5 skills
> M-87 (`/rag-setup`, `/ai-safety`, `/prompt-eval`, `/ai-cost-gate`,
> `/ai-observability`) estén en estado **DONE verificado**. M14 (Business Model)
> consume esta spec para el marketplace de templates. Mientras tanto, este archivo
> es la fuente de verdad que cualquier generador (humano o agente) debe respetar.

---

## Overview

`ai-agent-starter-pro` es el template de referencia del plugin `king-ai`: un
starter productivo para construir agentes LLM con RAG, evaluación, safety y
observabilidad ya cableados. No es un "hello world" — es el punto de partida que
demuestra TODOS los patterns que los skills M-87 implementan, integrados en un solo
proyecto desplegable.

El objetivo es que un desarrollador clone el repo y, en menos de 5 pasos, tenga un
agente RAG funcional con evals, safety gates y trazas de costo/latencia, listo para
deploy en Vercel.

**Fuente original**: `10-vertical-coverage.md §V8 §7.2`.
**Plugin destino**: `king-ai`.
**Consumidor**: M14 (Business Model) → marketplace de templates.

---

## Stack del Template

El stack es FIJO y opinado. No es negociable por proyecto generado: el valor del
template está en que todas las piezas ya encajan entre sí.

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Lenguaje | **TypeScript** | Tipado estricto end-to-end; structured outputs con Zod |
| Orquestación LLM | **Vercel AI SDK** | Streaming, tool calling, structured outputs unificados |
| Proveedor LLM | **Anthropic SDK** | Claude como modelo primario; routing a Haiku para fallback de costo |
| Vector store | **pgvector** | Embeddings y similarity search dentro de Postgres (sin DB extra) |
| Base de datos | **Postgres** | Persistencia de documentos, chunks, evals y audit ledger |
| Framework web | **Next.js 15 (App Router)** | API routes, RSC, streaming UI, deploy 1-click en Vercel |

```
┌──────────────────────────────────────────────────────────────────┐
│                  ai-agent-starter-pro — Arquitectura               │
└──────────────────────────────────────────────────────────────────┘

   Next.js 15 (App Router)
        │
        │  route handler / RSC
        ▼
   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
   │ AI Safety    │─────▶│  RAG Pipeline │─────▶│  Anthropic   │
   │ Layer        │      │  (Vercel AI   │      │  SDK (Claude)│
   │ (pre + post) │      │   SDK)        │      │              │
   └──────────────┘      └──────┬───────┘      └──────┬───────┘
        │                       │                     │
        │ pii redaction         │ retrieve            │ cost/latency
        │ jailbreak block       ▼                     ▼
        │                ┌──────────────┐      ┌──────────────┐
        │                │  pgvector /   │      │  Cost Gate +  │
        │                │  Postgres     │      │ Circuit Break │
        │                └──────────────┘      └──────────────┘
        │                                              │
        └──────────────────────┬───────────────────────┘
                               ▼
                    ┌─────────────────────────┐
                    │  Observability           │
                    │  (Langfuse + OTel spans) │
                    └─────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────┐
                    │  Eval Harness (golden    │
                    │  set + CI regression)    │
                    └─────────────────────────┘
```

---

## Features del Template

Cada feature del template está respaldada por un skill que la genera. El template
es, en esencia, el output combinado de los skills M-87 más patterns existentes.

| Feature | Implementado con skill | Status |
|---------|------------------------|--------|
| RAG pipeline funcional | `/rag-setup` | Generado |
| Eval harness | `/prompt-eval` | Generado |
| AI safety layer | `/ai-safety` | Generado |
| Observability (Langfuse + OTel) | `/ai-observability` | Generado |
| Cost tracking + circuit breaker | `/ai-cost-gate` | Generado |
| Cost attribution report | `/cost-report` | Generado |
| Structured outputs (Zod) | `/llm-integration` | Existente |
| Prompt versioning en `prompts/` | Todos los skills | Pattern |
| CASTLE gates preconfigurados | Template `.king/` | Generado |
| CI con eval regression detection | `/prompt-eval` | Generado |
| Deploy Vercel 1-click | Vercel config en template | Manual |

### Notas sobre las columnas Status

- **Generado** — el artefacto sale directamente del skill correspondiente cuando se
  ejecuta sobre el scaffold del template.
- **Existente** — el pattern ya vive en `king-ai` (`/llm-integration`) y solo se
  referencia; no requiere M-87 nuevo.
- **Pattern** — convención transversal que TODOS los skills respetan (versionado de
  prompts en `prompts/<nombre>.vN.md`).
- **Manual** — paso que el desarrollador ejecuta una sola vez (conectar el repo a
  Vercel); el template incluye el `vercel.json` listo.

---

## Criterio de Activación

El repositorio NO se genera hasta cumplir la precondición. Esto evita publicar un
template que muestre features a medio implementar.

> **Activación**: cuando `/rag-setup` + `/ai-safety` + `/prompt-eval` +
> `/ai-cost-gate` + `/ai-observability` estén **TODOS** en estado **DONE
> verificado**, se lanza la tarea de generación del repo `ai-agent-starter-pro`.

```yaml
# Precondición de generación (gate de activación)
activation:
  required_skills_done:
    - "/rag-setup"
    - "/ai-safety"
    - "/prompt-eval"
    - "/ai-cost-gate"
    - "/ai-observability"
  verification: "DONE verificado"   # no basta con merge; requiere verify pass
  on_satisfied: "lanzar tarea de generación del repositorio del template"
  scope: "FUERA de M03"             # el repo es entregable posterior
```

Mientras la precondición no se cumpla, este knowledge file es el único entregable
relacionado con el template dentro de M03.

---

## Criterios de Testing del Template

El template generado se considera VÁLIDO solo si pasa los 4 criterios. Son
deliberadamente ejecutables desde un clone limpio: la promesa del template es
"funciona out of the box".

| # | Comando | Criterio de pass | Qué verifica |
|---|---------|------------------|--------------|
| 1 | `npm run demo` | respuesta RAG en **< 10 seg** desde clone limpio | El pipeline ingest→retrieve→generate vive de extremo a extremo |
| 2 | `npm run eval` | `golden_set_score >= 0.85` reportado en CI | Calidad de las respuestas sobre el golden set |
| 3 | `npm run test:safety` | `jailbreak_block_rate >= 95%` | El safety layer bloquea ataques conocidos (OWASP LLM Top 10) |
| 4 | `npm run build` | **0 errores** TypeScript | Tipado estricto sin deuda; structured outputs válidos |

```yaml
# Suite de validación del template — los 4 criterios deben pasar
template_acceptance:
  - id: 1
    cmd: "npm run demo"
    pass: "rag_response_seconds < 10"
  - id: 2
    cmd: "npm run eval"
    pass: "golden_set_score >= 0.85"
  - id: 3
    cmd: "npm run test:safety"
    pass: "jailbreak_block_rate >= 95"
  - id: 4
    cmd: "npm run build"
    pass: "typescript_errors == 0"
```

> Estos criterios son un subconjunto ejecutable de los gates `ai:` de
> `.king/quality-gates.yaml` (`eval.golden_set_score: 0.85`,
> `safety.jailbreak_block_rate: 95`). El template los hereda preconfigurados.

---

## Setup en ≤ 5 Pasos

La promesa de DX del template: de clone a agente RAG funcional en cinco pasos.

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/king-framework/ai-agent-starter-pro
cd ai-agent-starter-pro && npm install

# 2. Configurar variables de entorno (Anthropic + Postgres)
cp .env.example .env.local
#    Editar: ANTHROPIC_API_KEY, DATABASE_URL (Postgres con pgvector)

# 3. Levantar Postgres con pgvector y migrar el esquema
docker compose up -d        # incluye extensión pgvector
npm run db:migrate          # crea tablas: documents, chunks, evals, audit

# 4. Ingerir el dataset de ejemplo (genera embeddings)
npm run ingest -- ./data/sample

# 5. Probar el agente RAG end-to-end
npm run demo                # < 10 seg → respuesta con citaciones
```

Tras el paso 5, el desarrollador tiene RAG, evals (`npm run eval`), safety
(`npm run test:safety`) y observabilidad (trazas Langfuse/OTel) operativos. El
deploy a Vercel es el único paso manual adicional, ya con `vercel.json` incluido.

---

## Layout esperado del repositorio

Estructura de referencia que el generador debe producir (no exhaustiva, pero los
directorios marcados son contractuales).

```
ai-agent-starter-pro/
├── app/                        # Next.js 15 App Router
│   ├── api/chat/route.ts       # endpoint streaming (Vercel AI SDK)
│   └── page.tsx                # UI mínima de demo
├── lib/
│   ├── rag/                    # ingest, chunking, retrieve (pgvector)
│   ├── safety/                 # pre/post guards (pii, jailbreak)
│   ├── cost/                   # cost gate + circuit breaker
│   └── observability/          # langfuse-client.ts | otel spans
├── prompts/                    # prompts versionados: <nombre>.vN.md
├── eval/
│   └── golden-set/v1/cases.json   # golden set (convención /prompt-eval, ver llm-evals.md)
├── tests/ai-safety/
│   └── adversarial-prompts.json   # casos adversariales (convención /ai-safety)
├── db/migrations/              # esquema documents/chunks/evals/audit
├── .king/                      # CASTLE gates + quality-gates.yaml preconfig
├── docker-compose.yml          # Postgres + pgvector
├── vercel.json                 # deploy 1-click
└── package.json                # scripts: demo, eval, test:safety, build, ingest
```

> Convención transversal (**Pattern**): cada prompt vive en `prompts/` con sufijo de
> versión (`router.v3.md`), y cada skill que lo consume referencia la versión exacta.
> Esto habilita la detección de regresión de evals al cambiar de versión de prompt.

---

## Ejemplo: endpoint con safety + RAG + cost gate

Boceto de cómo encajan las capas en un route handler (ilustrativo, no normativo más
allá del orden de las guardas).

```typescript
// app/api/chat/route.ts
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { guardInput, guardOutput } from "@/lib/safety";
import { retrieve } from "@/lib/rag";
import { withCostGate } from "@/lib/cost";
import { withObservability } from "@/lib/observability";

export async function POST(req: Request) {
  const { message } = await req.json();

  // 1. Safety PRE: pii redaction + jailbreak block (antes de tocar el modelo)
  const safeInput = await guardInput(message); // pii_leak_rate == 0

  // 2. RAG: retrieve sobre pgvector
  const context = await retrieve(safeInput, { topK: 5 });

  // 3. Generación con cost gate (circuit breaker → fallback Haiku) + traza
  const result = await withObservability(() =>
    withCostGate(() =>
      streamText({
        model: anthropic("claude-sonnet"),
        system: context.systemPrompt, // versionado en prompts/
        prompt: safeInput,
      }),
    ),
  );

  // 4. Safety POST: content moderation sobre la salida
  return guardOutput(result).toDataStreamResponse();
}
```

---

## Gates heredados (referencia)

El template preconfigura la sección `ai:` de `.king/quality-gates.yaml`. Los 4
criterios de testing son la materialización ejecutable de estos gates.

```yaml
# .king/quality-gates.yaml — sección heredada por el template
ai:
  cost:
    usd_per_request_p95: 0.05
  latency:
    p95_ms: 3000
  eval:
    golden_set_score: 0.85
  safety:
    jailbreak_block_rate: 95
    pii_leak_rate: 0
  observability:
    tracing_coverage_pct: 100
  enforcement: block
```

---

## Resumen ejecutable

| Aspecto | Valor |
|---------|-------|
| Naturaleza de este doc | SPEC del template (repo fuera de scope de M03) |
| Stack | TypeScript · Vercel AI SDK · Anthropic SDK · pgvector · Postgres · Next.js 15 |
| Features generadas | 11 (RAG, evals, safety, observability, cost, audit, etc.) |
| Activación | 5 skills M-87 en DONE verificado |
| Criterios de testing | 4 (demo <10s · eval ≥0.85 · safety ≥95% · build 0 errores) |
| Setup | ≤ 5 pasos hasta RAG funcional |
| Consumidor | M14 Business Model (marketplace de templates) |
