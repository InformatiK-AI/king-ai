---
name: ai-observability
description: "Instrumentar trazas LLM con OpenTelemetry GenAI semantic conventions + backend Langfuse/Helicone + prompt versioning + token attribution por feature. Gate tracing_coverage_pct:100 — toda llamada LLM debe tener span."
argument-hint: "[--dest <dir>] [--backend langfuse|helicone] [--sampling <0.0-1.0>] [--prompts-dir <dir>]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /ai-observability

Ejecutar el skill de AI Observability Layer.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:ai-observability`
2. Argumentos opcionales:
   - `--dest <dir>`: directorio destino de los módulos de observabilidad (default: `src/observability/`)
   - `--backend langfuse|helicone`: backend de UI de trazas vía adapter `langfuse-helicone` (default: langfuse)
   - `--sampling <0.0-1.0>`: ratio de sampling de spans (default: 0.1 en prod, 1.0 en dev). El sampling NO afecta la cobertura del gate
   - `--prompts-dir <dir>`: directorio de prompts para `prompt-registry.ts` (default: `prompts/`)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (DETECT + INSTRUMENT, PHASES.md) → Phase 3-4 (BACKEND + COVERAGE GATE, PHASES.md) → Phase N+1 (Session)
4. Agentes: @ml-engineer (primario, posee CASTLE layer T, veta si tracing_coverage_pct<100), @developer (templates, integración del tracer, .env.example), @architect (backend y sampling)

## Parámetros

| Parámetro | Valores | Default | Efecto |
|-----------|---------|---------|--------|
| `--dest` | ruta | `src/observability/` | Dónde se generan los `.ts` |
| `--backend` | `langfuse` \| `helicone` | `langfuse` | Implementación del adapter `TraceBackend` |
| `--sampling` | `0.0`–`1.0` | `0.1` prod / `1.0` dev | `OTEL_TRACES_SAMPLER_ARG` |
| `--prompts-dir` | ruta | `prompts/` | Fuente de prompts versionados |

## Outputs

Documenta cómo generar en el proyecto del usuario (los `.ts` NO los crea el skill, los genera en el proyecto):

- `src/observability/{otel-llm-tracer,langfuse-client,prompt-registry,token-attribution,metrics-exporter}.ts`
- `.env.example` actualizado con `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER`, `LANGFUSE_SECRET_KEY` (y Helicone si aplica)
- `tests/observability/tracing-coverage.test.ts` (contract test de spans, CASTLE T)
- Sección `ai.observability` en `.king/quality-gates.yaml`

## Gate de bloqueo

- `tracing_coverage_pct == 100` — toda llamada LLM debe tener span OTel. Cualquier endpoint sin `otel-llm-tracer.ts` veta el merge; veredicto `@ml-engineer` BREACHED en CASTLE layer T. No superable sin instrumentar el endpoint.

Cada span DEBE incluir los atributos GenAI semconv obligatorios (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) y los custom King (`king.feature_id`, `king.agent_id`, `king.sdd_phase`).

## Prerequisito

Requiere OTel base configurado (gap E4). Si NO está, el skill lo instala como prerequisito — NO bloquea por su ausencia.

## Ejemplos

```bash
# Instrumentar la integración LLM existente con defaults (Langfuse, sampling 10% prod)
/ai-observability

# Backend Helicone con setup mínimo
/ai-observability --backend helicone

# Sampling al 100% (entorno de dev) y destino custom
/ai-observability --sampling 1.0 --dest src/lib/obs/

# Prompts externalizados en un directorio propio
/ai-observability --prompts-dir config/prompts/
```

## Notas

- Si no se detecta integración LLM en el proyecto, recomendar ejecutar `/llm-integration` primero — no hay llamadas que trazar.
- El backend es intercambiable vía adapter `langfuse-helicone`: cambiar de Langfuse a Helicone es cambiar la implementación de `TraceBackend`, nunca el tracer.
- Sampling y cobertura son independientes: 10% de sampling NO significa 10% de cobertura. La cobertura mide instrumentación (siempre 100%); el sampling mide qué fracción de spans se exporta.
- Si el gate `tracing_coverage_pct < 100`, permanecer en `/ai-observability` e instrumentar el endpoint faltante antes de continuar.
- Próximo paso natural: `/ai-cost-gate` consume `llm_tokens_total` por `feature_id` para presupuesto y circuit breaker.
