---
name: ai-cost-gate
description: "Añadir control de costo LLM (budget por feature + quota por usuario + fallback automático + circuit breaker) a una integración existente. Previene runaway costs. Gates: usd_per_request_p95 (CASTLE E) y circuit-breaker obligatorio."
argument-hint: "[--dest <dir>] [--quota-backend redis|upstash|<url>] [--no-quota]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /ai-cost-gate

Ejecutar el skill de AI Cost Gate.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:ai-cost-gate`
2. Argumentos opcionales:
   - `--dest <dir>`: directorio destino de los módulos de cost gate (default: `src/cost-gate/`)
   - `--quota-backend redis|upstash|<url>`: backend para per-user quota. Si se omite y no se detecta Redis/Upstash en el stack → modo degradado (solo circuit breaker + budget enforcer)
   - `--no-quota`: omitir explícitamente la per-user quota (genera `quota-tracker.ts` como stub no-op)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (DETECT + BUDGET MODEL, PHASES.md) → Phase 3-4 (GENERATE + GATES, PHASES.md) → Phase N+1 (Session)
4. Agentes: @ml-engineer (primario — valida fallback_chain, thresholds y circuit breaker; veta BREACHED si falta el breaker), @developer (templates, setup de backend, wiring), @security (manejo de quota por usuario sin PII)

## Parámetros

| Parámetro | Valores | Default | Efecto |
|-----------|---------|---------|--------|
| `--dest` | ruta | `src/cost-gate/` | Directorio de los 5 módulos `.ts` |
| `--quota-backend` | `redis` \| `upstash` \| `<url>` | autodetect | Backend de per-user quota; sin él → modo degradado |
| `--no-quota` | flag | off | Fuerza modo degradado (quota stub no-op) |

## Outputs

Documenta cómo generar en el proyecto del usuario (los `.ts` NO los crea el skill, los genera en el proyecto):

- `src/cost-gate/{budget-enforcer,quota-tracker,model-router,circuit-breaker,cost-estimator}.ts`
- `cost-gate.config.yaml` (budgets por feature, quotas por tier, config del circuit breaker)
- Sección `ai.cost` en `.king/quality-gates.yaml`
- Eventos 429 (quota) y open/close (breaker) en `.king/audit/YYYY-MM-DD.jsonl` + Engram `ai_audit`

## Gates de bloqueo

- `circuit-breaker.ts` **obligatorio** — sin él, `@ml-engineer` veta como **BREACHED** (no hay protección contra degradación del modelo / cost p95 disparado).
- `usd_per_request_p95` — medido en load test contra el threshold por feature. Si lo supera → CASTLE E **advierte** (WARNING, no bloqueo duro: el fallback lo mitiga).

## Blocking condition — sin backend de quota

Si el proyecto NO tiene Redis/Upstash y no se pasó `--quota-backend`: el skill **NO aborta**. Advierte `"Sin backend de quota: per-user limits no pueden aplicarse"` y ofrece continuar solo con circuit breaker + budget enforcer (degradación grácil). El founder sigue protegido del runaway cost global (budget mensual por feature), aunque no de un usuario individual abusivo.

## Fallback chain

El fallback automático degrada SOLO hacia modelos más baratos: `opus → sonnet → haiku`. NUNCA escala a un modelo más caro. Cuando el circuito está abierto, el usuario recibe una respuesta degradada (haiku), nunca un error 500.

## Ejemplos

```bash
# Control de costo con autodetección de backend (Upstash/Redis si está en el stack)
/ai-cost-gate

# Per-user quota con Upstash explícito
/ai-cost-gate --quota-backend upstash

# Solo budget enforcer + circuit breaker (sin per-user quota), destino custom
/ai-cost-gate --no-quota --dest src/lib/cost-gate/
```

Si no se detecta integración LLM en el proyecto, recomendar ejecutar `/llm-integration` primero — no hay costo que gobernar.
Si falta `circuit-breaker.ts` o `usd_per_request_p95` supera el threshold, permanecer en `/ai-cost-gate` y remediar antes de continuar.
