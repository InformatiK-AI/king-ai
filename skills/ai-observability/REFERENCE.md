# ai-observability — REFERENCE

> 📚 Documentación. Esta sección NO contiene acciones — tabla de spans OTel GenAI semconv, Langfuse vs Helicone tradeoffs, métricas Prometheus, `.env.example`, formatos de config y ejemplos de código TS.
> OTel GenAI semantic conventions se documenta INLINE aquí (no hay knowledge dedicado). Pattern Engram: `knowledge/domain/engram-integration.md`.

---

## ADR-01: Skill standalone con contrato hacia @ml-engineer

`/ai-observability` es independiente. No invoca otros skills de negocio. Produce un **reporte de cobertura de tracing** consumido por `@ml-engineer` como contrato del CASTLE layer T. El veto sobre `tracing_coverage_pct < 100` es bloqueante: toda llamada LLM debe tener span.

## ADR-02: GenAI semantic conventions como contrato del span

Los spans siguen las OpenTelemetry GenAI semantic conventions (`gen_ai.*`). Esto hace que cualquier backend OTLP-compatible (Langfuse, Helicone, Jaeger, Tempo, Datadog) entienda los spans sin mapeo custom. Los atributos King (`king.*`) extienden, no reemplazan, el estándar.

## ADR-03: Adapter pattern para el backend de trazas (langfuse-helicone)

`langfuse-client.ts` expone la interfaz `TraceBackend`; `LangfuseClient` y `HeliconeClient` son intercambiables (igual que `content-moderator.ts` en `/ai-safety`). El tracer NUNCA depende de un backend concreto. Cambiar de backend es cambiar la implementación, no el tracer.

## ADR-04: Cobertura vs sampling — distinción crítica

`tracing_coverage_pct` mide **instrumentación** (cuántos entrypoints LLM pasan por el tracer), NO cuántos spans se exportan. El sampling (10% prod / 100% dev) decide qué fracción de spans se envía al backend, pero TODA llamada se instrumenta. Confundir ambos llevaría a pensar que sampling 10% = cobertura 10%, lo cual es falso: la cobertura sigue siendo 100%.

---

## Tabla de spans OTel GenAI semantic conventions

Cada llamada LLM emite UN span con estos atributos. Los marcados "Sí" son obligatorios para el gate `tracing_coverage_pct: 100`.

| Atributo | Ejemplo | Tipo | Obligatorio | Origen |
|----------|---------|------|-------------|--------|
| `gen_ai.system` | `"anthropic"` | string | Sí | OTel GenAI semconv |
| `gen_ai.request.model` | `"claude-sonnet-4-5"` | string | Sí | OTel GenAI semconv |
| `gen_ai.request.max_tokens` | `2048` | int | No | OTel GenAI semconv |
| `gen_ai.request.temperature` | `0.7` | double | No | OTel GenAI semconv |
| `gen_ai.response.id` | `"msg_01ABC"` | string | No | OTel GenAI semconv |
| `gen_ai.response.model` | `"claude-sonnet-4-5"` | string | No | OTel GenAI semconv |
| `gen_ai.response.finish_reason` | `"end_turn"` | string | No | OTel GenAI semconv |
| `gen_ai.usage.input_tokens` | `512` | int | Sí | OTel GenAI semconv |
| `gen_ai.usage.output_tokens` | `234` | int | Sí | OTel GenAI semconv |
| `gen_ai.operation.name` | `"chat"` | string | No | OTel GenAI semconv |
| `king.feature_id` | `"chat-assistant"` | string | Sí | King custom |
| `king.agent_id` | `"ml-engineer"` | string | Sí | King custom |
| `king.sdd_phase` | `"build"` | string | No | King custom |
| `king.prompt.version` | `"1.2.0"` | string | No | King custom (prompt-registry) |
| `king.prompt.hash` | `"a1b2c3d"` | string | No | King custom (prompt-registry) |
| `session_id` | `"sess_42"` | string | No | token-attribution |
| `user_id` | `"u_007"` | string | No | token-attribution |

> Span name convención GenAI: `"{gen_ai.operation.name} {gen_ai.request.model}"` → ej. `"chat claude-sonnet-4-5"`.
> El span KIND es `CLIENT` (la app es cliente del LLM remoto).
> Ejemplo del set mínimo (del plan M-87):

```
gen_ai.system = "anthropic"
gen_ai.request.model = "claude-sonnet-4-5"
gen_ai.request.max_tokens = 2048
gen_ai.response.finish_reason = "end_turn"
gen_ai.usage.input_tokens = 512
gen_ai.usage.output_tokens = 234
king.feature_id = "chat-assistant"
king.agent_id = "ml-engineer"
king.sdd_phase = "build"
```

---

## Langfuse vs Helicone — tradeoffs

Ambos backends consumen el span OTel vía el adapter `langfuse-helicone`. La elección NO cambia el tracer.

| Dimensión | Langfuse | Helicone |
|-----------|----------|----------|
| Modelo de integración | SDK + OTLP exporter (instrumentación en código) | Proxy / gateway (cambias el base URL del SDK LLM) |
| Self-host | Sí (Docker, postgres) — control total del dato | Sí (Helm), pero el flujo natural es cloud |
| Setup mínimo | Medio (SDK + keys) | Muy bajo (cambiar base URL + header) |
| Prompt management | Nativo (versioning, A/B, playground) — encaja con `prompt-registry.ts` | Básico (templates) |
| Evals / scoring | Nativo (dataset runs, scores) | Limitado |
| Latencia añadida | Nula (export async, fuera del path) | Añade un hop de red (es proxy) |
| Privacidad del dato | Alta si self-host (el dato no sale) | El proxy ve cada request (mitigable self-host) |
| Caching de respuestas | No (foco en observabilidad) | Sí (caching en el proxy) |
| Cuándo elegirlo | Necesitas prompt management + evals + self-host estricto | Quieres observabilidad con setup casi cero y caching |

> Default del skill: **Langfuse** (encaja con `prompt-registry.ts` y self-host). Usa Helicone si el proyecto ya enruta por un gateway o prioriza setup mínimo + caching. Cambiar de uno a otro = cambiar la implementación de `TraceBackend`, nada más.

---

## Métricas Prometheus — `metrics-exporter.ts`

| Métrica | Tipo | Labels | Descripción |
|---------|------|--------|-------------|
| `llm_request_duration_seconds` | histogram | `model`, `feature_id`, `status` | Latencia end-to-end de la llamada LLM (buckets para p50/p95/p99) |
| `llm_tokens_total` | counter | `model`, `feature_id`, `token_type` (`input`\|`output`) | Tokens consumidos acumulados — base para cost attribution por feature |

```
# HELP llm_request_duration_seconds Duración de una llamada LLM en segundos.
# TYPE llm_request_duration_seconds histogram
llm_request_duration_seconds_bucket{model="claude-sonnet-4-5",feature_id="chat-assistant",status="ok",le="0.5"} 12
llm_request_duration_seconds_bucket{model="claude-sonnet-4-5",feature_id="chat-assistant",status="ok",le="1"} 30
llm_request_duration_seconds_count{model="claude-sonnet-4-5",feature_id="chat-assistant",status="ok"} 42

# HELP llm_tokens_total Tokens LLM consumidos (input + output).
# TYPE llm_tokens_total counter
llm_tokens_total{model="claude-sonnet-4-5",feature_id="chat-assistant",token_type="input"} 21504
llm_tokens_total{model="claude-sonnet-4-5",feature_id="chat-assistant",token_type="output"} 9828
```

> `llm_tokens_total` con label `feature_id` es lo que habilita la **token attribution por feature**: agregás por `feature_id` y obtenés el consumo por funcionalidad — input directo de `/ai-cost-gate`.

---

## `.env.example` — variables a añadir

```bash
# ── OpenTelemetry (tracing base) ────────────────────────────────────
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # collector OTLP (HTTP/protobuf)
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_SERVICE_NAME=my-llm-app
# Sampling: 100% en dev, 10% en prod. NO usar 100% en prod por default.
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1                          # 0.1 = 10% (prod); 1.0 = 100% (dev)

# ── Backend de trazas: Langfuse (default) ───────────────────────────
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx                   # placeholder — NUNCA la clave real en el repo
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com             # o tu instancia self-host

# ── Backend de trazas: Helicone (alternativa, --backend=helicone) ───
# HELICONE_API_KEY=sk-helicone-xxxxxxxx
# HELICONE_BASE_URL=https://oai.helicone.ai/v1
```

> Reglas: solo placeholders, jamás claves reales. Las claves van en `.env` (gitignored) o gestor de secretos. En prod, `OTEL_TRACES_SAMPLER_ARG=0.1`; en dev, `1.0`.

---

## Formato gates en `.king/quality-gates.yaml`

```yaml
# .king/quality-gates.yaml — sección ai.observability
ai:
  observability:
    tracing_coverage_pct: 100   # toda llamada LLM debe tener span — veto si < 100
```

- `tracing_coverage_pct == 100` — cualquier llamada LLM sin span bloquea de inmediato. Veto `@ml-engineer` (CASTLE T) no superable sin instrumentar el endpoint.

---

## Ejemplos de código TS

### `otel-llm-tracer.ts` — wrapper con GenAI semconv

```typescript
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";

const tracer = trace.getTracer("king-ai-llm");

export interface TraceCtx {
  featureId: string;   // → king.feature_id
  agentId: string;     // → king.agent_id
  sddPhase?: string;   // → king.sdd_phase
  sessionId?: string;
  userId?: string;
}

// Envuelve CUALQUIER llamada LLM. Toda llamada DEBE pasar por aquí (gate 100%).
export async function tracedLLM<T extends { usage: { input: number; output: number }; finishReason: string }>(
  ctx: TraceCtx,
  req: { system: string; model: string; maxTokens: number },
  call: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    `chat ${req.model}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttributes({
        "gen_ai.system": req.system,
        "gen_ai.request.model": req.model,
        "gen_ai.request.max_tokens": req.maxTokens,
        "king.feature_id": ctx.featureId,
        "king.agent_id": ctx.agentId,
        "king.sdd_phase": ctx.sddPhase ?? "",
      });
      try {
        const res = await call();
        span.setAttributes({
          "gen_ai.response.finish_reason": res.finishReason,
          "gen_ai.usage.input_tokens": res.usage.input,
          "gen_ai.usage.output_tokens": res.usage.output,
        });
        return res;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();   // SIEMPRE — sin spans colgados ante error
      }
    },
  );
}
```

### `langfuse-client.ts` — adapter intercambiable (langfuse-helicone)

```typescript
export interface TraceBackend {
  exporter(): SpanExporter;                  // OTLP exporter para el provider OTel
  flush(): Promise<void>;
}
// LangfuseClient y HeliconeClient implementan la MISMA interfaz.
// El tracer NUNCA importa una clase concreta — recibe TraceBackend por inyección.
```

### `prompt-registry.ts` — versión + hash git

```typescript
// Carga el prompt desde prompts/<name>.md, expone version + hash git del archivo.
export function loadPrompt(name: string): { text: string; version: string; hash: string };
// El tracer inyecta king.prompt.version y king.prompt.hash en el span.
```

### `token-attribution.ts` — etiquetado por feature

```typescript
// Deriva los atributos de attribution desde el contexto de request.
export function attribution(ctx: TraceCtx): Record<string, string> {
  return {
    "king.feature_id": ctx.featureId,
    session_id: ctx.sessionId ?? "anon",
    user_id: ctx.userId ?? "anon",
  };
}
```

### `metrics-exporter.ts` — Prometheus

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("king-ai-llm");
const duration = meter.createHistogram("llm_request_duration_seconds");
const tokens = meter.createCounter("llm_tokens_total");

export function recordMetrics(model: string, featureId: string, secs: number, inTok: number, outTok: number) {
  duration.record(secs, { model, feature_id: featureId, status: "ok" });
  tokens.add(inTok, { model, feature_id: featureId, token_type: "input" });
  tokens.add(outTok, { model, feature_id: featureId, token_type: "output" });
}
```

---

## Schema `tracing-coverage.test.ts` (contract test, CASTLE T)

```typescript
// Verifica que CADA llamada LLM produce un span con los atributos obligatorios.
// Usa un InMemorySpanExporter para inspeccionar los spans emitidos.
const REQUIRED = [
  "gen_ai.system",
  "gen_ai.request.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "king.feature_id",
  "king.agent_id",
];

// Para cada LLM_ENTRYPOINT:
//   1. ejecutar la llamada (mockeada)
//   2. assert: exactamente 1 span emitido
//   3. assert: span.attributes contiene TODOS los REQUIRED
// tracing_coverage_pct = entrypoints_con_span_valido / total_entrypoints * 100
// El test FALLA si tracing_coverage_pct < 100.
```

---

## Cómo se cumplen los escenarios Gherkin (M-87)

| Escenario Gherkin | Mecanismo en este skill |
|-------------------|-------------------------|
| Scenario 1: toda llamada LLM produce span con `gen_ai.*` + `king.feature_id`/`king.agent_id`, gate pasa en CI | `otel-llm-tracer.ts` (REQUIRED OUTPUT) emite el span; `tracing-coverage.test.ts` lo verifica; gate `tracing_coverage_pct: 100` en `.king/quality-gates.yaml` |
| Scenario 2: gate bloquea llamada LLM no trazada (CASTLE T → BREACHED, merge bloqueado) | BLOCKING CONDITIONS del `SKILL.md` (`tracing_coverage_pct < 100` y endpoint sin `otel-llm-tracer.ts`); `@ml-engineer` veta como BREACHED en Phase 4 |

---

## Relación con otros skills

- **`/llm-integration`** (prerequisito de negocio): genera el cliente LLM. `otel-llm-tracer.ts` envuelve sus llamadas. Sin integración LLM, no hay nada que trazar (BLOCKING).
- **`/ai-cost-gate`** (consumidor downstream): consume `llm_tokens_total` por `feature_id` para presupuesto y circuit breaker. La observabilidad alimenta el cost gate.
- **OTel base (gap E4)**: prerequisito técnico. Si falta, este skill lo INSTALA (no bloquea) — ver PHASES.md Phase 2.
