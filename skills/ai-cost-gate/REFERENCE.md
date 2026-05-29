# ai-cost-gate — REFERENCE

> 📚 Documentación. Esta sección NO contiene acciones — formato de `cost-gate.config.yaml`, ejemplos de código TS, setup de Redis/Upstash, schemas y formatos de gates.
> Knowledge de cost tracking: `knowledge/_inject/llm-integration-essentials.md`. Pattern Engram: `knowledge/domain/engram-integration.md`.

---

## ADR-01: Skill standalone con contrato hacia @ml-engineer

`/ai-cost-gate` es independiente. No invoca otros skills de negocio. Produce un **reporte de costo** (estado del breaker, `usd_per_request_p95` por feature, `fallback_chain`, modo de quota) consumido por `@ml-engineer` como contrato. El veto de `@ml-engineer` sobre la ausencia de `circuit-breaker.ts` es **BREACHED**.

## ADR-02: Backend de quota OPCIONAL — degradación grácil

Redis/Upstash es opcional. Sin backend, `quota-tracker.ts` se genera como stub no-op y el skill continúa con circuit breaker + budget enforcer. El founder sigue protegido del runaway cost GLOBAL (budget mensual por feature), aunque NO de un usuario individual abusivo. NUNCA se aborta por falta de backend.

## ADR-03: Fallback solo hacia abajo (opus→sonnet→haiku)

La `fallback_chain` SOLO degrada hacia modelos más baratos. El router nunca escala a un modelo más caro: el objetivo es contener costo, no calidad. Una respuesta degradada (haiku) es preferible a un error 500 o a un gasto descontrolado.

## ADR-04: Estimación PRE-call

`cost-estimator.ts` cuenta tokens ANTES de la llamada (count_tokens / tiktoken) y decide budget/route antes de gastar. Estimar post-call serviría solo para tracking, no para gobernar el gasto. El budget check es siempre previo.

---

## Cobertura de los escenarios Gherkin (M-87)

| Escenario | Artefacto / Gate |
|-----------|------------------|
| Circuit breaker activa fallback automático | `circuit-breaker.ts` (open tras 3 requests) + `model-router.ts` (fallback a haiku), respuesta degradada sin 500 |
| Quota per-user bloqueada al límite diario | `quota-tracker.ts` → HTTP 429 + evento en AI Audit Ledger |
| Sin backend de quota configurado | BLOCKING CONDITION: advertir y ofrecer continuar con breaker + budget enforcer (degradación grácil, NO abortar) |

---

## Formato `cost-gate.config.yaml` (completo)

Vive en la raíz del proyecto del usuario. Budgets por feature, quotas por tier, config del circuit breaker.

```yaml
# cost-gate.config.yaml — control de costo LLM por feature
version: 1

# Modelo primario por defecto y precios de referencia (USD por 1M tokens).
# Ajustar a los precios vigentes del provider.
models:
  claude-opus-4-5:   { input: 15.00, output: 75.00 }
  claude-sonnet-4-5: { input: 3.00,  output: 15.00 }
  claude-haiku-4-5:  { input: 0.80,  output: 4.00 }

features:
  chat-assistant:
    primary_model: claude-opus-4-5
    usd_per_request_p95: 0.05      # gate CASTLE E (WARNING si se supera en load test)
    usd_monthly_budget: 500        # presupuesto mensual de la feature
    per_user_daily_tokens: 50000   # quota diaria por usuario (requiere backend)
    fallback_chain: [claude-sonnet-4-5, claude-haiku-4-5]   # solo modelos más baratos

  rag-search:
    primary_model: claude-sonnet-4-5
    usd_per_request_p95: 0.10
    usd_monthly_budget: 300
    fallback_chain: [claude-haiku-4-5]

# Circuit breaker: ventana deslizante; abre si el error/cost rate supera el umbral.
circuit_breaker:
  error_threshold_pct: 50    # % de requests sobre threshold en la ventana para abrir
  window_seconds: 60         # ventana deslizante
  half_open_requests: 3      # requests de prueba en half-open antes de cerrar/reabrir
  open_cooldown_seconds: 30  # tiempo en open antes de pasar a half-open

# Quotas por tier de usuario (aplican solo con backend Redis/Upstash configurado).
quota:
  backend: upstash           # redis | upstash | none
  tiers:
    free:       { per_user_daily_tokens: 50000 }
    pro:        { per_user_daily_tokens: 500000 }
    enterprise: { per_user_daily_tokens: 5000000 }
  on_exceed:
    http_status: 429
    message: "daily token quota exceeded"
```

> Cuando no hay backend (`quota.backend: none`), las claves `per_user_daily_tokens` se documentan pero NO se aplican: `quota-tracker.ts` es un stub no-op. El budget mensual y el circuit breaker SÍ aplican siempre.

---

## Formato gates en `.king/quality-gates.yaml`

```yaml
# .king/quality-gates.yaml — sección ai.cost
ai:
  cost:
    usd_per_request_p95: warn   # CASTLE E ADVIERTE si el load test supera el threshold por feature
    circuit_breaker_required: true   # sin circuit-breaker.ts → @ml-engineer veta BREACHED
    fallback_no_error_500: true      # circuito abierto debe degradar, nunca devolver 500
```

- `usd_per_request_p95` — medido contra el threshold por feature de `cost-gate.config.yaml`. Por encima → WARNING (no bloqueo duro: el fallback lo mitiga).
- `circuit_breaker_required` — la ausencia de `circuit-breaker.ts` es veto **BREACHED** de `@ml-engineer`.

---

## Ejemplos de código TS

### `cost-estimator.ts` — token counting PRE-call

```typescript
import type { Message } from "../llm/types";

interface ModelPricing { input: number; output: number; } // USD por 1M tokens

// Estima el costo ANTES de llamar al LLM. Nunca post-call.
export async function estimate(
  messages: Message[],
  model: string,
  pricing: Record<string, ModelPricing>,
  maxOutputTokens = 1024,
): Promise<number> {
  const inputTokens = await countTokens(messages, model); // count_tokens / tiktoken
  const p = pricing[model];
  if (!p) throw new Error(`cost-estimator: precio desconocido para ${model}`);
  return (inputTokens * p.input + maxOutputTokens * p.output) / 1_000_000;
}
```

### `budget-enforcer.ts` — check PRE-call

```typescript
export interface BudgetVerdict { allowed: boolean; reason?: "request_p95" | "monthly_budget"; }

export async function check(
  featureId: string,
  estimatedUsd: number,
  cfg: FeatureBudget,
  monthlySpentUsd: number, // acumulado de la feature (de la tabla llm_usage)
): Promise<BudgetVerdict> {
  if (estimatedUsd > cfg.usd_per_request_p95) return { allowed: false, reason: "request_p95" };
  if (monthlySpentUsd + estimatedUsd > cfg.usd_monthly_budget) return { allowed: false, reason: "monthly_budget" };
  return { allowed: true };
}
// allowed:false NO es error 500 — señala al model-router para hacer fallback.
```

### `circuit-breaker.ts` — open / half-open / closed con ventana deslizante

```typescript
type State = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: State = "closed";
  private window: { ts: number; over: boolean }[] = [];
  private openedAt = 0;
  private halfOpenAllowed = 0;

  constructor(private cfg: { error_threshold_pct: number; window_seconds: number; half_open_requests: number; open_cooldown_seconds: number }) {}

  canRequest(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.cfg.open_cooldown_seconds * 1000) {
        this.state = "half_open";
        this.halfOpenAllowed = this.cfg.half_open_requests;
      } else return false;
    }
    if (this.state === "half_open") return this.halfOpenAllowed-- > 0;
    return true; // closed
  }

  // over = true si el request superó el threshold de costo/error.
  record(over: boolean): void {
    const now = Date.now();
    this.window = this.window.filter((e) => now - e.ts < this.cfg.window_seconds * 1000);
    this.window.push({ ts: now, over });

    if (this.state === "half_open") {
      if (over) this.trip();
      else if (this.halfOpenAllowed <= 0) this.close();
      return;
    }
    const overPct = (this.window.filter((e) => e.over).length / this.window.length) * 100;
    if (overPct >= this.cfg.error_threshold_pct) this.trip();
  }

  private trip(): void {
    this.state = "open"; this.openedAt = Date.now();
    auditLog({ event: "circuit_open", reason: "cost_p95_threshold" }); // AI Audit Ledger
  }
  private close(): void {
    this.state = "closed"; this.window = [];
    auditLog({ event: "circuit_close" });
  }
}
```

### `model-router.ts` — fallback automático opus→sonnet→haiku

```typescript
export interface RouteResult { model: string; degraded: boolean; }

// Devuelve SIEMPRE un modelo permitido. Nunca lanza error 500 por circuito abierto:
// si el primario está bloqueado, degrada por la fallback_chain hacia modelos más baratos.
export async function route(
  feature: FeatureConfig,
  estimatedUsd: number,
  ctx: { breaker: CircuitBreaker; monthlySpentUsd: number; pricing: Record<string, ModelPricing> },
): Promise<RouteResult> {
  const chain = [feature.primary_model, ...feature.fallback_chain]; // opus, sonnet, haiku
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const est = await estimate(ctx.lastMessages, model, ctx.pricing);
    const budget = await check(feature.id, est, feature, ctx.monthlySpentUsd);
    const breakerOk = i === 0 ? ctx.breaker.canRequest() : true; // breaker solo gobierna el primario
    if (budget.allowed && breakerOk) {
      return { model, degraded: i > 0 };
    }
  }
  // Último recurso: el modelo más barato de la chain (respuesta degradada, NUNCA 500).
  return { model: chain[chain.length - 1], degraded: true };
}
```

### `quota-tracker.ts` — per-user con Upstash (modo full)

```typescript
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export class QuotaExceededError extends Error {
  status = 429;
  constructor() { super("daily token quota exceeded"); }
}

// Incrementa tokens del usuario con TTL diario; lanza 429 al exceder.
export async function consume(userId: string, tokens: number, dailyLimit: number): Promise<void> {
  const key = `quota:${userId}:${new Date().toISOString().slice(0, 10)}`; // quota:user:YYYY-MM-DD
  const used = await redis.incrby(key, tokens);
  if (used === tokens) await redis.expire(key, 86_400); // TTL 24h en el primer incr
  if (used > dailyLimit) {
    auditLog({ event: "quota_exceeded", userId, used, dailyLimit, status: 429 }); // AI Audit Ledger
    throw new QuotaExceededError();
  }
}
```

### `quota-tracker.ts` — stub no-op (modo degraded, sin backend)

```typescript
// QUOTA_MODE=degraded: no hay backend Redis/Upstash. Per-user quota NO se aplica.
// El budget mensual por feature y el circuit breaker siguen protegiendo el costo global.
export async function consume(_userId: string, _tokens: number, _dailyLimit: number): Promise<void> {
  // quota disabled: no backend configured. Documentado en cost-gate.config.yaml (quota.backend: none).
  return;
}
```

### Wiring en el entrypoint LLM

```typescript
// Orden obligatorio: estimate → budget → quota → route → call
const est = await estimate(messages, feature.primary_model, pricing);
await consume(userId, estTokens, feature.per_user_daily_tokens); // 429 si excede (modo full)
const { model, degraded } = await route(feature, est, { breaker, monthlySpentUsd, pricing });
const res = await llm.complete(messages, { model });
breaker.record(/* over = */ res.cost_usd > feature.usd_per_request_p95);
// res.degraded informa al cliente que la respuesta usó un modelo más barato (no es un error).
```

---

## Setup Redis/Upstash (backend de quota)

### Opción A — Upstash (serverless, recomendada para founders)

```bash
# 1. Crear una base Redis en https://upstash.com (free tier disponible)
# 2. Copiar las credenciales REST al entorno (NUNCA al repo ni al chat)
export UPSTASH_REDIS_REST_URL="https://<region>-<id>.upstash.io"
export UPSTASH_REDIS_REST_TOKEN="<token>"

# 3. Instalar el cliente
npm install @upstash/redis
```

```typescript
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv(); // lee UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
```

### Opción B — Redis self-hosted / ioredis

```bash
export REDIS_URL="redis://localhost:6379"
npm install ioredis
```

```typescript
import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);
// consume(): redis.incrby(key, tokens) + redis.expire(key, 86400) en el primer incr
```

> Ejecutar `/ai-cost-gate --quota-backend upstash` (o `redis`) para regenerar `quota-tracker.ts` en modo full una vez configurado el backend.

---

## Esquema de costo (alineado con `llm_usage`)

El budget enforcer lee el gasto acumulado de la tabla `llm_usage` generada por `/llm-integration`. Campos relevantes (ver `knowledge/_inject/llm-integration-essentials.md`):

`provider, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd, latency_ms`

> NUNCA guardar `prompt_text`, `response_text` ni `user_ip` en el tracking de costo (columnas PII prohibidas). El cálculo del budget mensual usa `SUM(cost_usd)` por `feature_id` en la ventana del mes.

---

## Audit log — formato `.king/audit/YYYY-MM-DD.jsonl`

Cada evento de quota (429) y transición del breaker (open/close) registra una línea JSONL (append-only):

```json
{"ts":"2026-05-28T12:00:00Z","event":"quota_exceeded","userId":"u_123","used":50001,"dailyLimit":50000,"status":429,"feature":"chat-assistant"}
{"ts":"2026-05-28T12:01:00Z","event":"circuit_open","reason":"cost_p95_threshold","feature":"chat-assistant","fallbackTo":"claude-haiku-4-5"}
```

El mismo evento se persiste en Engram en el canal `ai_audit` con tags `[ml-engineer, {phase}, {feature}]` (ver `knowledge/domain/engram-integration.md` §4).

---

## Engram first-class (resumen)

| Fase | Acción | Obligatorio |
|------|--------|-------------|
| Phase 0 | `mem_context({ topic_key: 'ai_session' })` + `mem_search` de decisiones de costo previas | Sí |
| Decisión (fallback_chain, thresholds, backend, breaker) | `mem_save({ scope })` en el momento | Sí |
| Evento 429 / open-close breaker | `mem_save({ topic_key: 'ai_audit', tags: ['ml-engineer', phase, feature] })` | Sí |
| Phase N+1 | `mem_session_summary({ include_decisions: true, include_costs: true })` | Sí |
| Engram caído | Fallback a Chronicle con advertencia | Sí |

> `include_costs: true` es crítico en este skill: persiste el costo estimado/medido de la sesión para que futuras sesiones razonen con el histórico de gasto. Ver `knowledge/domain/engram-integration.md` §8 para el contrato completo.
