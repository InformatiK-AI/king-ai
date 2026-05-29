# MLEngineer-Performance Contract

## Propósito
Define el protocolo de interacción entre @ml-engineer y @performance para gestionar tradeoffs de cost/latency, model routing (opus/sonnet/haiku), estrategia de prompt caching y token budgets por tier. @performance posee los presupuestos globales de latencia; @ml-engineer posee la traducción a costo de inferencia y selección de modelo.

---

## Escenarios de Interacción

| Escenario | Iniciador | Receptor | Tipo | Bloquea |
|-----------|-----------|----------|------|---------|
| Entrega de presupuestos de cost/latency por tier | @performance | @ml-engineer | Budget Handoff | Sí |
| Propuesta de model routing para feature nueva | @ml-engineer | @performance | Routing Proposal | No |
| Violación de `usd_per_request_p95` o `latency p95_ms` | @performance | @ml-engineer | Budget Violation | Sí |
| Estrategia de prompt caching para reducir costo | @ml-engineer | @performance | Optimization Proposal | No |
| Tradeoff calidad vs costo no resoluble | @ml-engineer o @performance | Usuario | Escalation | Sí |

---

## Performance Budget Handoff: Presupuestos por Tier

### Cuándo @performance entrega presupuestos a @ml-engineer

```yaml
type: "performance_budget_handoff"
from: "@performance"
to: "@ml-engineer"
timestamp: "{ISO}"

version: "{semver o sprint ID}"

# Presupuestos de costo (referencia .king/quality-gates.yaml sección ai)
cost_budgets:
  usd_per_request_p95: 0.05      # gate INSUPERABLE en enforcement: block
  usd_per_request_p99: 0.12
  monthly_ceiling_usd: 500       # circuit breaker abre al alcanzarlo

latency_budgets:
  p95_ms: 3000                   # gate
  p99_ms: 6000
  time_to_first_token_ms: 800    # crítico para streaming/chatbots

# Presupuestos de tokens por tier de operación
token_budgets_by_tier:
  interactive:                   # chatbot, RAG query en tiempo real
    max_input_tokens: 8000
    max_output_tokens: 1024
    preferred_model: "claude-haiku-* | claude-sonnet-*"
  batch:                         # procesamiento offline, evals
    max_input_tokens: 32000
    max_output_tokens: 4096
    preferred_model: "claude-sonnet-*"
  reasoning:                     # síntesis, diseño, tiebreaker adversarial
    max_input_tokens: 64000
    max_output_tokens: 8192
    preferred_model: "claude-opus-*"
```

### Response Format (@ml-engineer → @performance)

```yaml
type: "performance_budget_ack"
from: "@ml-engineer"
to: "@performance"
timestamp: "{ISO}"

status: "ACCEPTED | NEEDS_NEGOTIATION"

current_baseline_measurements:
  usd_per_request_p95: 0.038
  latency_p95_ms: 2400
  cache_hit_rate_pct: 62
  avg_input_tokens: 5200

negotiation_items:  # solo si status es NEEDS_NEGOTIATION
  - budget: "{nombre del presupuesto}"
    requested: "{valor actual}"
    proposed_target: "{valor negociado}"
    rationale: "{justificación técnica — ej: reasoning tier necesita opus}"
```

---

## Model Routing Proposal: Feature Nueva

### Cuándo @ml-engineer propone routing a @performance

```yaml
type: "model_routing_proposal"
from: "@ml-engineer"
to: "@performance"
timestamp: "{ISO}"

feature: "{nombre de la feature}"

routing_decision:
  - task: "{clasificación | extracción | síntesis | reasoning}"
    tier: "interactive | batch | reasoning"
    model: "claude-haiku-* | claude-sonnet-* | claude-opus-*"
    rationale: "{por qué este modelo matchea la complejidad}"
    estimated_usd_per_request: 0.012
    estimated_latency_p95_ms: 1800

prompt_caching:
  enabled: true|false
  cached_prefix: "{system prompt | RAG context estático | tool definitions}"
  expected_hit_rate_pct: 70
  cost_reduction_estimate_pct: 45    # caching reduce input tokens facturados

fallback_chain:
  - "claude-sonnet-* → claude-haiku-* en rate limit / timeout"

within_budget: true|false
```

### Response Format (@performance → @ml-engineer)

```yaml
type: "model_routing_review"
from: "@performance"
to: "@ml-engineer"
timestamp: "{ISO}"

verdict: "PASS | FAIL | CONDITIONAL"

approved_for_release: true|false

required_optimizations:  # solo si verdict es FAIL o CONDITIONAL
  - dimension: "{cost | latency | caching}"
    priority: "BLOCKING | HIGH | MEDIUM"
    optimization: "{ej: bajar reasoning a sonnet; aumentar cache TTL; reducir contexto}"
    target: "{valor objetivo}"
    deadline: "{sprint o fecha}"

reference:
  - "/ai-cost-gate"
  - "/ai-observability"
```

---

## Prompt Caching Strategy

### Principios de caching acordados

| Patrón | Recomendación | Beneficio |
|--------|---------------|-----------|
| System prompt estable | Cachear como prefijo (cache breakpoint) | Reduce input tokens facturados ~90% en el prefijo |
| RAG context estático (docs base) | Cachear el bloque de retrieval estable | Hit rate alto en sesiones largas |
| Tool / function definitions | Cachear junto al system prompt | Constante entre llamadas |
| Historial de conversación largo | Cache incremental por turnos | Evita re-facturar todo el historial |
| Contexto único por request | NO cachear | El cache write tendría costo sin reuso |

> El cache hit rate se monitorea vía `/ai-observability`. Un hit rate < 40% en operaciones interactive dispara una Optimization Proposal hacia @performance.

---

## Budget Violation (Performance → ML Engineer)

### Cuándo @performance alerta por presupuesto excedido

```yaml
type: "budget_violation"
from: "@performance"
to: "@ml-engineer"
timestamp: "{ISO}"

gate_violated: "{usd_per_request_p95 | latency_p95_ms | monthly_ceiling_usd}"
measured: "{valor medido}"
budget: "{valor límite}"
delta: "{diferencia}"

observability_source: "/ai-observability — {span/trace de referencia}"
verdict: "EXCEEDS_BUDGET"
blocking_release: true|false
```

### Response Format (@ml-engineer → @performance)

```yaml
type: "budget_violation_response"
from: "@ml-engineer"
to: "@performance"
in_response_to: "{violation_timestamp}"

acknowledgment: true
root_cause: "{ej: contexto inflado; modelo sobredimensionado; cache miss alto}"

optimization_plan:
  - action: "{ej: routear de opus a sonnet para esta tarea}"
    expected_cost_reduction_pct: 60
    quality_impact: "NONE | MINIMAL | NEEDS_EVAL"
    effort: "LOW | MEDIUM | HIGH"
  - action: "{ej: habilitar prompt caching del system prompt}"
    expected_cost_reduction_pct: 40
    effort: "LOW"

estimated_resolution_sprint: "{sprint ID o fecha}"
```

---

## Iteration Loop

### Máximo 2 ciclos violation-fix

```
@performance violation → @ml-engineer optimization → @performance re-measure (ciclo 1)
  → Si sigue fuera de budget:
@performance violation → @ml-engineer optimization → @performance re-measure (ciclo 2)
  → Si persiste: escalar a usuario (tradeoff calidad vs costo)
```

---

## Señales de Escalación

### @ml-engineer consulta @performance cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| Define routing de feature nueva | "¿Opus o sonnet para esto?" | Routing Proposal |
| Quiere validar estrategia de caching | "¿Cacheo el RAG context?" | Optimization Proposal |
| Necesita presupuestos por tier | "¿Cuál es el budget interactive?" | Budget Handoff request |

### @performance escala a @ml-engineer cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| `usd_per_request_p95` excedido | "Costo p95 en 0.08 > 0.05" | Budget Violation |
| `latency p95_ms` excedido | "p95 en 4200ms > 3000ms" | Budget Violation |
| Monthly ceiling cercano | "Circuit breaker a punto de abrir" | Budget Violation |

### Escala a usuario cuando:

| Señal | Ejemplo |
|-------|---------|
| Tradeoff calidad vs costo irresoluble | "Solo opus cumple el AC pero rompe el budget" |
| 2 ciclos sin converger a budget | "Optimizaciones aplicadas, sigue fuera de presupuesto" |
| Cambio de tier requiere decisión de negocio | "Subir el ceiling mensual" |

---

## Timeouts y Fallbacks

| Situación | Timeout | Fallback |
|-----------|---------|----------|
| Budget Handoff sin respuesta | Blocking | @ml-engineer usa defaults de quality-gates.yaml |
| Budget Violation sin fix | N/A (blocking si block enforcement) | Escalar a usuario |
| Routing Proposal sin review | Continuar con | Usar el modelo de menor costo que cumpla calidad + marcar CONDITIONAL |
| Circuit breaker abierto | Inmediato | Fallback a claude-haiku-* + alerta a usuario |
| @performance no activado en /genesis | N/A | @ml-engineer aplica budgets default y reporta CONDITIONAL |

---

## Ver también

- **MLEngineer-Security Contract**: `agents/contracts/ml-engineer-security.md`
- **MLEngineer-QA Contract**: `agents/contracts/ml-engineer-qa.md`
- **MLEngineer-Developer Contract**: `agents/contracts/ml-engineer-developer.md`
- **Escalation Matrix**: `agents/_common/escalation-matrix.md`
- **Context Handoff**: `agents/_common/context-handoff.md`
- **Cost Gate**: `/ai-cost-gate`
- **Observability**: `/ai-observability`
