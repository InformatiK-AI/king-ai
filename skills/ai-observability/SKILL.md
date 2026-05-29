---
name: ai-observability
version: 1.0
api_version: 1.0.0
description: "Skill para instrumentar trazas LLM con OpenTelemetry GenAI semantic conventions + backend Langfuse/Helicone + prompt versioning + token attribution por feature. Usar cuando se necesite: trazar llamadas LLM, observabilidad de IA, OTel GenAI spans, Langfuse, Helicone, prompt registry, token attribution, métricas Prometheus de LLM, o garantizar tracing_coverage_pct 100%."
---

# /ai-observability — AI Observability Layer

Skill standalone que documenta cómo instrumentar la observabilidad de CUALQUIER integración LLM del proyecto del usuario: cada llamada al modelo emite un **span OTel** con GenAI semantic conventions (`gen_ai.*`) más atributos custom de King (`king.feature_id`, `king.agent_id`, `king.sdd_phase`). Cubre tracing distribuido, backend de UI de trazas vía adapter (Langfuse o Helicone), prompt versioning con hash git, token attribution por feature y métricas Prometheus. El gate central es `tracing_coverage_pct: 100` — toda llamada LLM debe tener span, sin excepciones.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1), fallback Chronicle | Sí | framework |
| `knowledge/_inject/llm-integration-essentials.md` | Cliente LLM existente, wrapper de `complete()`/`stream()` donde inyectar el tracer | No | framework |
| `knowledge/domain/llm-patterns.md` | Patrones de uso de tokens, finish_reason, modelos | No | framework |

> OTel GenAI semantic conventions NO tiene knowledge dedicado — se documenta inline en `REFERENCE.md` (tabla de spans, atributos `gen_ai.*` y `king.*`).
> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → abortar y reportar al usuario.

- [ ] No existe ninguna integración LLM en el proyecto (no hay `*-client.ts` ni llamada a un SDK LLM) → no hay nada que trazar; recomendar `/llm-integration` primero
- [ ] El gate `tracing_coverage_pct < 100` (existe al menos una llamada LLM sin span OTel) → ⛔ veto bloqueante de `@ml-engineer` en CASTLE layer T; el merge queda bloqueado hasta que TODA llamada use `otel-llm-tracer.ts` (Gherkin Scenario 2)
- [ ] Se detecta un endpoint LLM que no usa `otel-llm-tracer.ts` al ejecutar CASTLE layer T → BREACHED con "LLM call en <ruta> sin OTel span", merge bloqueado (Gherkin Scenario 2)

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA dejar una llamada LLM sin span — `tracing_coverage_pct` debe ser 100; un solo endpoint sin tracer veta el merge
- NUNCA emitir un span sin los atributos GenAI semconv obligatorios (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) ni sin los custom King (`king.feature_id`, `king.agent_id`)
- NUNCA acoplar el código a un backend de UI concreto — adapter `langfuse-helicone` obligatorio (intercambiable vía `--backend`)
- NUNCA registrar el prompt o el output crudo en el span sin respetar la política de PII/redacción (el contenido sensible no va en atributos de span por default)
- NUNCA hardcodear el endpoint OTLP ni las claves del backend — solo `process.env.OTEL_EXPORTER_OTLP_ENDPOINT`, `process.env.LANGFUSE_SECRET_KEY`, etc.
- NUNCA usar sampling 100% en producción por default — el sampling es configurable (10% prod / 100% dev); 100% siempre solo en dev

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE documentar cómo generar en el proyecto del usuario (los `.ts` NO se crean aquí).

- [ ] `src/observability/otel-llm-tracer.ts` — wrapper OTel que emite el span GenAI semconv (`gen_ai.*` + `king.*`) por cada llamada LLM (Gherkin Scenario 1)
- [ ] `src/observability/langfuse-client.ts` — integración del backend de UI de trazas vía adapter `langfuse-helicone` (opt-in con `--backend=langfuse|helicone`)
- [ ] `src/observability/prompt-registry.ts` — carga prompts desde `prompts/` con versión y hash git, expone `king.prompt.version`
- [ ] `src/observability/token-attribution.ts` — etiqueta cada span con `king.feature_id`, `session_id`, `user_id`
- [ ] `src/observability/metrics-exporter.ts` — métricas Prometheus: `llm_request_duration_seconds`, `llm_tokens_total`
- [ ] `.env.example` actualizado con `OTEL_EXPORTER_OTLP_ENDPOINT`, `LANGFUSE_SECRET_KEY` y demás variables (ver `REFERENCE.md`)
- [ ] `tests/observability/tracing-coverage.test.ts` — contract test de spans: toda llamada LLM produce span con los atributos obligatorios (CASTLE T)
- [ ] Sección `ai.observability` en `.king/quality-gates.yaml` con `tracing_coverage_pct: 100`
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1-2                 Phase 3-4                      Phase N+1
(Load)   →   (DETECT + INSTRUMENT)  →   (BACKEND + COVERAGE GATE)  →   (Session)
             OTel base + entrypoints     Adapter langfuse/helicone
             Tracer GenAI semconv        Contract test + gate 100%
```

---

## CASTLE ACTIVO: _·_·_·T·L·_

> Logging/observability primaria + Testing (contract test de spans). Ver `skills/_shared/castle-capas.md`.

- **L (Logging/Observability)**: gate central del skill. Toda llamada LLM emite un span OTel con GenAI semconv. La trazabilidad distribuida es el output principal: spans correlacionados, métricas Prometheus y backend de UI (Langfuse/Helicone). Sampling configurable (10% prod / 100% dev) sin sacrificar cobertura del gate.
- **T (Testing)**: contract test de spans. `tracing-coverage.test.ts` verifica que cada llamada LLM produce un span con los atributos obligatorios. `@ml-engineer` posee el CASTLE layer T del dominio: ejecuta la verificación y veta como BREACHED si `tracing_coverage_pct < 100`.

Gate mínimo: **CONDITIONAL** (FORTIFIED solo si `tracing_coverage_pct == 100` y el contract test pasa).

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — primario. Posee CASTLE layer T del dominio. Valida los atributos GenAI semconv, ejecuta el contract test de spans y veta como BREACHED si `tracing_coverage_pct < 100`.
- **@developer** — documentación de los templates de código a generar, integración del tracer en el cliente LLM, actualización de `.env.example`.
- **@architect** — decisión de backend (Langfuse vs Helicone), estrategia de sampling y topología del exporter OTLP.

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI con `mem_context({ topic_key: 'ai_session', limit: 5 })` — recuperar decisiones previas de observabilidad y backend elegido
2. [ ] `mem_search({ query: 'observability OTel tracing backend langfuse helicone sampling', tags: ['observability', 'llm'], limit: 3 })` — no re-proponer un backend ya descartado
3. [ ] Si standalone: continuar sin workflow. Si invocado desde `/build` o `/ai-feature-scaffold`: heredar workflow context

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §8.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~liviano; sub-archivos cargados on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: OTel Base Detection ([PHASES.md#phase-1-otel-base-detection](PHASES.md#phase-1-otel-base-detection)) | [PHASES.md](PHASES.md) |
| Phase 2: Tracer Instrumentation ([PHASES.md#phase-2-tracer-instrumentation](PHASES.md#phase-2-tracer-instrumentation)) | [PHASES.md](PHASES.md) |
| Phase 3: Backend + Registry + Metrics ([PHASES.md#phase-3-backend--registry--metrics](PHASES.md#phase-3-backend--registry--metrics)) | [PHASES.md](PHASES.md) |
| Phase 4: Coverage Gate + Contract Test ([PHASES.md#phase-4-coverage-gate--contract-test](PHASES.md#phase-4-coverage-gate--contract-test)) | [PHASES.md](PHASES.md) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] `src/observability/otel-llm-tracer.ts` documentado/generado (span GenAI semconv `gen_ai.*` + `king.feature_id`/`king.agent_id`/`king.sdd_phase`)
- [ ] `src/observability/langfuse-client.ts` documentado/generado (adapter `langfuse-helicone`, intercambiable)
- [ ] `src/observability/prompt-registry.ts` documentado/generado (versión + hash git desde `prompts/`)
- [ ] `src/observability/token-attribution.ts` documentado/generado (`feature_id`, `session_id`, `user_id`)
- [ ] `src/observability/metrics-exporter.ts` documentado/generado (`llm_request_duration_seconds`, `llm_tokens_total`)
- [ ] `.env.example` actualizado con `OTEL_EXPORTER_OTLP_ENDPOINT`, `LANGFUSE_SECRET_KEY` (y backend Helicone si aplica)
- [ ] `tests/observability/tracing-coverage.test.ts` generado (contract test de spans)
- [ ] Gate `tracing_coverage_pct == 100` PASA — cada llamada LLM tiene span (cero excepciones)
- [ ] CASTLE layer T no encuentra ningún endpoint LLM sin `otel-llm-tracer.ts`
- [ ] Sampling configurado (10% prod / 100% dev) sin afectar la cobertura del gate
- [ ] Sección `ai.observability` escrita en `.king/quality-gates.yaml`
- [ ] Reporte de cobertura de tracing entregado a `@ml-engineer` (contrato CASTLE T)
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _archivos de observabilidad generados/documentados, o "None"_ |
| Next Recommended | `/ai-cost-gate` \| `/qa --standard` \| permanecer en `/ai-observability` |
| Risks | _gate en WARNING, endpoint sin tracer, backend no elegido, o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir cada decisión de observabilidad con `mem_save({ scope })` EN EL MOMENTO (backend elegido, estrategia de sampling, atributos custom adoptados)
2. [ ] Registrar acción del agente: `mem_save({ topic_key: 'ai_audit', tags: ['ml-engineer', '{phase}', '{feature}'] })`
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — Engram first-class (M-18, ver `knowledge/domain/engram-integration.md` §8)
4. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Observabilidad instalada y `tracing_coverage_pct == 100` | `/ai-cost-gate` para presupuesto y circuit breaker sobre los tokens ya trazados |
| Se necesita validar calidad pre-merge | `/qa --standard` (CASTLE layer T ya tiene el contrato de cobertura) |
| Gate `tracing_coverage_pct < 100` o endpoint sin tracer | Permanecer en `/ai-observability`, instrumentar el endpoint antes de continuar |
| El proyecto aún no tiene integración LLM | `/llm-integration` primero — no hay llamadas que trazar |

---

> 📚 Para la tabla de spans OTel GenAI semconv, Langfuse vs Helicone tradeoffs, métricas Prometheus, `.env.example`, formatos de config y ejemplos de código TS: ver [REFERENCE.md](REFERENCE.md).
