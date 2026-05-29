---
name: ai-cost-gate
version: 1.0
api_version: 1.0.0
description: "Skill standalone para añadir control de costo LLM a integraciones existentes: budget por feature + quota por usuario + fallback automático a modelo más barato + circuit breaker. Usar cuando se necesite: limitar costo de IA, prevenir runaway costs, presupuesto LLM, per-user quota, fallback opus→sonnet→haiku, circuit breaker para LLM, proteger el presupuesto del founder, o configurar cost-gate.config.yaml."
---

# /ai-cost-gate — AI Cost Gate

Skill standalone que documenta cómo generar una capa de control de costo para CUALQUIER integración LLM del proyecto del usuario: `estimate → budget check → quota check → route (con fallback) → circuit breaker`. Previene los *runaway costs* que destruyen el presupuesto del founder: presupuesto por feature, quota por usuario, fallback automático al modelo más barato y circuit breaker open/half-open/closed. El backend de quota (Redis/Upstash) es OPCIONAL — sin él se degrada a circuit breaker + budget enforcer, NUNCA se aborta.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/llm-integration-essentials.md` | Cost tracking: campos obligatorios de `llm_usage`, precios por modelo, prompt caching, columnas PII prohibidas | Sí | framework |
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1), `include_costs: true` en session summary, AI Audit Ledger para eventos 429/breaker | Sí | framework |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → reportar al usuario y actuar según se indica.

- [ ] No existe ninguna integración LLM en el proyecto (no hay `*-client.ts` ni llamada a un SDK LLM) → no hay costo que gobernar; recomendar `/llm-integration` primero y abortar
- [ ] No hay backend de quota (Redis/Upstash) en el stack y no se pasó `--quota-backend` → ⚠️ NO abortar: advertir `"Sin backend de quota: per-user limits no pueden aplicarse"` y OFRECER continuar solo con circuit breaker + budget enforcer (degradación grácil, sin per-user quota)
- [ ] No se va a generar `circuit-breaker.ts` (el usuario lo excluye) → ⛔ `@ml-engineer` veta como **BREACHED**: una cost gate sin circuit breaker no protege contra degradación del modelo

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA generar la cost gate sin `circuit-breaker.ts` — sin él, `@ml-engineer` veta como BREACHED (no protege contra degradación de costo p95)
- NUNCA abortar por falta de backend de quota — degradar a circuit breaker + budget enforcer y advertir; el founder igual queda protegido del runaway cost global
- NUNCA hacer fallback "hacia arriba" (haiku→opus): el `fallback_chain` SOLO degrada hacia modelos más baratos (opus→sonnet→haiku)
- NUNCA devolver HTTP 500 cuando el circuito está abierto — degradar la respuesta vía fallback y responder al usuario (la degradación es transparente, no un error)
- NUNCA guardar `prompt_text`, `response_text` ni `user_ip` en el tracking de costo — solo tokens, modelo, costo, latencia (regla `llm_usage`, columnas PII prohibidas)
- NUNCA estimar el costo DESPUÉS de la llamada para decidir si bloquear — `cost-estimator.ts` cuenta tokens PRE-call; el budget check es previo a gastar

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE documentar cómo generar en el proyecto del usuario (los `.ts` NO se crean aquí).

- [ ] `src/cost-gate/budget-enforcer.ts` — verifica presupuesto (por request p95 + mensual) ANTES de cada llamada LLM
- [ ] `src/cost-gate/quota-tracker.ts` — per-user quota con Redis/Upstash como backend; HTTP 429 al exceder
- [ ] `src/cost-gate/model-router.ts` — fallback automático opus→sonnet→haiku si budget excedido o circuito abierto
- [ ] `src/cost-gate/circuit-breaker.ts` — open/half-open/closed con ventana deslizante
- [ ] `src/cost-gate/cost-estimator.ts` — estima costo PRE-call (token counting antes de la llamada)
- [ ] `cost-gate.config.yaml` — presupuestos por feature, quotas por tier de usuario, config del circuit breaker
- [ ] Eventos 429 (quota) y open/close (breaker) registrados en el AI Audit Ledger (`.king/audit/YYYY-MM-DD.jsonl` + Engram `ai_audit`)
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1-2                 Phase 3-4                    Phase N+1
(Load)   →   (DETECT + BUDGET MODEL)  →  (GENERATE + GATES)       →   (Session)
             Detectar LLM + backend       Generar 5 .ts + config
             Modelar budget/quota/chain   Load test p95 + breaker gate
```

---

## CASTLE ACTIVO: _·_·_·T·_·E

> Testing (circuit breaker) + Environment (budget / cost p95). Ver `skills/_shared/castle-capas.md`.

- **T (Testing)**: el circuit breaker es el gate central de testing. Se verifica bajo carga que open/half-open/closed transiciona correctamente y que el fallback activa sin error 500. Sin `circuit-breaker.ts` → `@ml-engineer` veta como **BREACHED**.
- **E (Environment)**: budget y cost p95 por entorno. `usd_per_request_p95` se mide en tests de carga; si supera el threshold configurado → CASTLE E **advierte** (WARNING). El budget mensual y las quotas viven en `cost-gate.config.yaml`, no hardcodeados.

Gate mínimo: **CONDITIONAL** (FORTIFIED solo si el circuit breaker pasa su test Y `usd_per_request_p95` queda bajo threshold).

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — primario. Valida la `fallback_chain`, los thresholds de costo y el circuit breaker. Veto **BREACHED** si falta `circuit-breaker.ts` o si `usd_per_request_p95` excede el budget sin fallback.
- **@developer** — documentación de los templates de código a generar, setup del backend Redis/Upstash, integración del router en los entrypoints LLM.
- **@security** — consultado para el manejo de quota por usuario (no filtrar identificadores, no loggear PII en el tracking de costo).

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI con `mem_context({ topic_key: 'ai_session', limit: 5 })` — recuperar decisiones de costo y vetos previos (modelos elegidos, budgets, backend de quota)
2. [ ] `mem_search({ query: 'cost gate budget quota fallback circuit breaker', tags: ['cost', 'llm'], limit: 3 })` — no re-proponer thresholds o chains ya descartados
3. [ ] Si standalone: continuar sin workflow. Si invocado desde `/build` o `/ai-feature-scaffold`: heredar workflow context

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §8.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~liviano; sub-archivos cargados on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: LLM & Backend Detection + Phase 2: Budget/Quota Model | [PHASES.md#phase-1-llm--backend-detection](PHASES.md#phase-1-llm--backend-detection) |
| Phase 3: Cost-Gate Generation + Phase 4: Gates & Load Testing | [PHASES.md#phase-3-cost-gate-generation](PHASES.md#phase-3-cost-gate-generation) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] `src/cost-gate/budget-enforcer.ts` documentado/generado (check por request p95 + mensual, PRE-call)
- [ ] `src/cost-gate/quota-tracker.ts` documentado/generado (per-user, Redis/Upstash, 429 al exceder) — o degradado con advertencia si no hay backend
- [ ] `src/cost-gate/model-router.ts` documentado/generado (fallback opus→sonnet→haiku, nunca hacia arriba)
- [ ] `src/cost-gate/circuit-breaker.ts` documentado/generado (open/half-open/closed, ventana deslizante) — OBLIGATORIO, sin él veto BREACHED
- [ ] `src/cost-gate/cost-estimator.ts` documentado/generado (token counting PRE-call)
- [ ] `cost-gate.config.yaml` generado con budgets por feature, quotas por tier y config del breaker
- [ ] Circuit breaker probado: abre tras N requests sobre threshold, el router hace fallback al modelo más barato, el usuario recibe respuesta degradada SIN error 500
- [ ] Quota probada: usuario que excede `per_user_daily_tokens` recibe HTTP 429 y el evento queda en el AI Audit Ledger (si hay backend de quota)
- [ ] Gate `usd_per_request_p95` bajo threshold en load test (o CASTLE E advierte si lo supera)
- [ ] Eventos 429 y open/close del breaker registrados en `.king/audit/YYYY-MM-DD.jsonl`
- [ ] Si no hay backend de quota: advertencia emitida y skill continuó solo con circuit breaker + budget enforcer (NO abortó)
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _archivos de cost-gate generados/documentados + `cost-gate.config.yaml`, o "None"_ |
| Next Recommended | `/ai-observability` \| `/qa --standard` \| permanecer en `/ai-cost-gate` |
| Risks | _`usd_per_request_p95` en WARNING, sin backend de quota (per-user no aplica), o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir cada decisión de costo con `mem_save({ scope })` EN EL MOMENTO (fallback_chain elegida, thresholds, backend de quota, parámetros del breaker)
2. [ ] Registrar acción del agente: `mem_save({ topic_key: 'ai_audit', tags: ['ml-engineer', '{phase}', '{feature}'] })`
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — Engram first-class (M-18). `include_costs: true` es crítico en este skill: persiste el costo estimado/medido de la sesión
4. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Cost gate instalada y circuit breaker PASS | `/ai-observability` para trazar costo por feature con OTel/Langfuse |
| Se necesita validar calidad pre-merge | `/qa --standard` (CASTLE layer E ya tiene los gates de budget/p95) |
| `usd_per_request_p95` supera threshold o falta `circuit-breaker.ts` | Permanecer en `/ai-cost-gate`, remediar antes de continuar |
| Sin backend de quota y se quiere per-user limits real | Configurar Redis/Upstash (ver REFERENCE.md) y re-ejecutar `/ai-cost-gate --quota-backend` |

---

> 📚 Para `cost-gate.config.yaml` completo, ejemplos de `model-router.ts` y demás `.ts`, setup de Redis/Upstash, schemas y formatos de gates: ver [REFERENCE.md](REFERENCE.md).
