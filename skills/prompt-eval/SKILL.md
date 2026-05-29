---
name: prompt-eval
version: 1.0
api_version: 1.0.0
description: "Skill para generar una suite de evals de prompts (golden set + LLM-as-judge + regression detector) ejecutable en CI con threshold gate bloqueante. Usar cuando se necesite: evaluar prompts, crear golden set, configurar LLM-as-judge, detectar regresiones de prompt, prompt eval en CI, eval harness, threshold gate de calidad LLM."
---

# /prompt-eval — Suite de Evals de Prompts en CI

Skill standalone que genera un **eval harness** en el proyecto del usuario: golden set versionado, runners de métricas (exact_match, semantic_similarity), LLM-as-judge con rúbrica (Haiku) y un regression detector contra `last_green_ci`, todo cableado a un workflow de CI con threshold gate **bloqueante**. Si el proyecto tiene RAG, el harness se extiende con `faithfulness` y `answer_relevance` (Ragas).

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/domain/llm-evals.md` | Golden sets, LLM-as-judge, detección de regresiones, métricas, integración CI | Sí | framework |
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1) | Sí | framework |

> Si un archivo de knowledge no existe: advertir y continuar con los defaults documentados en REFERENCE.md (degradación grácil). NUNCA bloquear por knowledge faltante.

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Si alguna es TRUE, DETENER inmediatamente y reportar al usuario

- [ ] No hay casos de uso documentados (`.king/knowledge/`, docs o input del usuario) de los que derivar ≥10 casos → preguntar antes de continuar; no inventar un golden set vacío `[Gherkin: bootstrap golden set]`
- [ ] El proyecto detectado no es TypeScript/JavaScript (sin `package.json`) → advertir y preguntar antes de generar runners `.ts`
- [ ] No se puede determinar el baseline (`baseline_strategy` no resoluble en el CI elegido) → preguntar la estrategia antes de cablear el regression gate `[Gherkin: regression en CI]`

### ABSOLUTE RESTRICTIONS
> 🚫 Comportamientos absolutamente prohibidos — sin excepciones

- NUNCA editar casos existentes de una versión publicada del golden set — version lock: corregir = crear `v2`, jamás mutar `v1`
- NUNCA usar como `judge_model` el mismo modelo bajo prueba sin rúbrica estricta (self-enhancement bias) — default `claude-haiku-4-5`
- NUNCA commitear reportes de eval — `eval/reports/` es solo `.gitkeep`; los reportes se generan en CI
- NUNCA generar un threshold gate no bloqueante — un step que falla DEBE retornar `exit != 0` y bloquear el merge
- NUNCA hardcodear `ANTHROPIC_API_KEY` en runners ni en el workflow — solo `process.env` / `secrets.ANTHROPIC_API_KEY_TEST`

### REQUIRED OUTPUTS
> 📦 Artefactos que DEBEN crearse al finalizar

- [ ] `eval/golden-set/v1/cases.json` — ≥10 casos `{id, input, expected_output, tags[]}` derivados del knowledge `[Gherkin: bootstrap]`
- [ ] `eval/golden-set/v1/metadata.json` — versión, fecha, `locked_until`, cobertura de edge cases
- [ ] `eval/runners/golden-set-runner.ts` — exact_match + semantic_similarity por caso
- [ ] `eval/runners/llm-judge.ts` — LLM-as-judge con rúbrica configurable (Haiku)
- [ ] `eval/runners/regression-detector.ts` — compara score actual vs baseline, detecta drop > `regression_max_drop` `[Gherkin: regression]`
- [ ] `eval/reports/.gitkeep` — placeholder; reportes NO se commitean
- [ ] `eval/eval.config.yaml` — thresholds, `judge_model`, `baseline_strategy`, weights
- [ ] `.github/workflows/prompt-eval.yml` — corre en `push: main` y `pull_request`; falla si score < threshold o hay regresión `[Gherkin: regression en CI]`
- [ ] Scripts `npm run eval*` documentados en `package.json` (`eval`, `eval:golden-set`, `eval:judge`, `eval:regression`)
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1-2            Phase 3-4              Phase N+1
(Load)   →   (HARNESS-SETUP)   →   (RUNNERS + CI)     →   (Session)
             Stack + casos de       Generación de
             uso → golden set       runners .ts + CI gate
             + eval.config.yaml      + extensión RAG
```

---

## CASTLE ACTIVO: _·_·_·T·_·_

- **T (Testing)**: el eval harness ES el gate de testing del sistema LLM. Verificación en Phase 4: el threshold gate es bloqueante (`exit != 0` ante fallo), el golden set tiene cobertura `happy-path` + `edge-case`, y el regression detector compara contra `last_green_ci` con `max_drop = 0.05`. Gate mínimo: **CONDITIONAL**.

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — Diseño del golden set (derivación de casos desde knowledge, balance de cobertura), elección de métricas por dominio, rúbrica del LLM-as-judge, validación del threshold gate.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: Este skill usa PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point liviano; las fases detalladas (GATE IN → MUST DO → CHECKPOINT → OUTPUTS → IF FAILS) viven en `PHASES.md` y se cargan on-demand.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Stack + Casos de Uso → Phase 2: Golden Set + Config | [PHASES.md](PHASES.md) |
| Phase 3: Runners → Phase 4: CI Gate + Extensión RAG | [PHASES.md](PHASES.md) |

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI de sesiones anteriores: `mem_context({ topic_key: 'ai_session', limit: 5 })`
2. [ ] Cargar `.king/registry.md` — detectar workflow activo en el branch actual
3. [ ] Si standalone: continuar sin asociación a workflow
4. [ ] Si invocado desde `/build` o `/ai-feature-scaffold`: heredar workflow context existente
5. [ ] Inyectar `knowledge/domain/llm-evals.md` (si existe) en el razonamiento; si falta, advertir y usar defaults de REFERENCE.md

> Delegado a `skills/session-management/SKILL.md` → Phase 0

---

## FINAL CHECKPOINT

Antes de terminar, verificar que TODOS los REQUIRED OUTPUTS existen:

- [ ] `eval/golden-set/v1/cases.json` con ≥10 casos válidos `{id, input, expected_output, tags[]}`
- [ ] `eval/golden-set/v1/metadata.json` con `version`, `created_at`, `locked_until`, `coverage`
- [ ] `eval/runners/golden-set-runner.ts`, `llm-judge.ts`, `regression-detector.ts` generados
- [ ] `eval/reports/.gitkeep` presente (sin reportes commiteados)
- [ ] `eval/eval.config.yaml` con thresholds, `judge_model: claude-haiku-4-5`, `baseline_strategy: last_green_ci`, `regression_max_drop: 0.05`
- [ ] `.github/workflows/prompt-eval.yml` corre en `push: main` + `pull_request` y es bloqueante
- [ ] Scripts `npm run eval*` agregados a `package.json`
- [ ] `npm run eval` (o dry-run documentado) ejecuta sin error y reporta score inicial `[Gherkin: npm run eval ejecuta sin error]`
- [ ] Si hay RAG detectado: `faithfulness` + `answer_relevance` añadidas al harness
- [ ] Security: sin API keys hardcodeadas en runners ni workflow
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar la tabla canónica (`skills/_shared/skill-envelope.md`) tras el FINAL CHECKPOINT y antes de Write Session.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _lista de archivos del harness creados, o "None"_ |
| Next Recommended | `/rag-setup` (extender métricas RAG) \| `/build` \| `/ai-cost-gate` |
| Risks | _golden set solo happy-path, baseline ausente, gate no bloqueante — o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1

Regla Engram first-class (ver `knowledge/domain/engram-integration.md` §8):

1. [ ] Persistir cada decisión de diseño del eval EN EL MOMENTO con `mem_save` (ej: métricas elegidas por dominio, weights, versión del golden set, estrategia de baseline) — `scope: project`
2. [ ] Registrar la acción del agente en el AI Audit Ledger: `mem_save({ topic_key: 'ai_audit', tags: ['ml-engineer', 'build', <feature>], scope: 'project' })`
3. [ ] Cierre OBLIGATORIO: `mem_session_summary({ include_decisions: true, include_costs: true })`
4. [ ] Si Engram no está disponible: degradar a Chronicle con advertencia (no romper el flujo)

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| El proyecto tiene o agregará RAG y se quieren métricas de recuperación | `/rag-setup` → extiende el harness con `faithfulness` + `answer_relevance` |
| Eval harness listo, se quiere controlar costo del juez en CI | `/ai-cost-gate` |
| Se quieren implementar/iterar prompts sobre el harness recién creado | `/build` |
| Golden set incompleto o gate no bloqueante | Permanecer en `/prompt-eval`, remediar antes de continuar |

---

> 📚 Formatos de config, schemas y ejemplos de código TS: ver [REFERENCE.md](REFERENCE.md).
