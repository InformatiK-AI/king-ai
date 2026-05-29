---
name: judgment-day
version: 1.0
api_version: 1.0.0
description: "Modo de revisión adversarial con 2 jueces ciegos en paralelo + tiebreaker con Opus. Usar cuando se invoque /review --adversarial, /plan --adversarial, /sdd-spec --adversarial o /ai-safety --adversarial: dos jueces independientes (claude-sonnet) revisan el MISMO target sin verse, se comparan veredictos, y solo si discrepan se invoca Judge-C (claude-opus) como tiebreaker. Output: reporte adversarial con 3 secciones + veredicto final + acciones pre-merge."
---

# /review --adversarial — Judgment-Day Adversarial Review

`judgment-day` NO es un comando propio: es el **modo adversarial** que se activa con el flag `--adversarial` sobre `/review`, `/plan`, `/sdd-spec` o `/ai-safety`. Lanza DOS jueces independientes (`claude-sonnet`) que revisan el MISMO target en PARALELO, cada uno CIEGO al output del otro. Si ambos veredictos concuerdan, el resultado es firme y NO se invoca tiebreaker. Solo si discrepan se lanza Judge-C (`claude-opus`) con los transcripts de A y B como input; el veredicto de C es el veredicto final.

El valor del protocolo es eliminar el sesgo de un solo revisor: dos jueces ciegos exponen blind spots distintos, y un tercero (más capaz) arbitra únicamente cuando hay desacuerdo real, conteniendo el costo.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1) | Sí | framework |
| `knowledge/_inject/ai-safety-patterns.md` | Taxonomía de amenazas para el modo `/ai-safety --adversarial` (threat modeling) | No | framework |
| `knowledge/domain/llm-patterns.md` | Patrones LLM-as-judge para calibrar el prompt de cada juez | No | framework |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → abortar y reportar al usuario.

- [ ] No se pasó el flag `--adversarial` → este modo no aplica; delegar al skill base (`/review`, `/plan`, `/sdd-spec`, `/ai-safety`) en su modo normal
- [ ] El comando host no es uno de `{review, plan, sdd-spec, ai-safety}` → ⛔ `--adversarial` no soportado en ese comando; reportar los 4 modos válidos *(mapea Gherkin: "--adversarial disponible en /plan y /sdd-spec")*
- [ ] No existe un TARGET resoluble para el modo (diff vacío en `review`, sin plan en `plan`, sin spec en `sdd-spec`, sin safety layer en `ai-safety`) → ⛔ no hay qué juzgar; reportar y abortar
- [ ] No se pueden lanzar dos sub-agentes en paralelo (entorno sin soporte de fan-out) → ⛔ el protocolo de jueces ciegos no puede garantizarse; abortar sin emitir veredicto parcial

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA exponer a Judge-A el output, hallazgos o existencia del veredicto de Judge-B (ni viceversa) — la ceguera mutua es la garantía del protocolo
- NUNCA invocar Judge-C (tiebreaker) si Judge-A y Judge-B concuerdan — el consenso es firme, invocar Opus sería desperdicio y rompe el contrato *(mapea Gherkin: "NO se invoca el tiebreaker")*
- NUNCA emitir el veredicto final antes de haber recibido AMBOS veredictos (A y B) completos
- NUNCA sustituir el veredicto de Judge-C por el de A o B cuando hubo tiebreaker — si C fue invocado, el veredicto final ES el de C *(mapea Gherkin: "el veredicto final es el de Judge C")*
- NUNCA ejecutar A y B secuencialmente compartiendo contexto — DEBEN lanzarse en paralelo, con prompts independientes
- NUNCA continuar a Phase N+1 sin haber persistido el veredicto final y las acciones pre-merge

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE producir. Cada escenario Gherkin mapea aquí o a una BLOCKING CONDITION.

- [ ] **Reporte adversarial** con 3 secciones: `### Judge A`, `### Judge B`, `### Tiebreaker (Judge C / Opus)` *(la 3ª es CONDICIONAL: presente solo si A y B discreparon)* *(mapea Gherkin: "el reporte muestra los 3 veredictos")*
- [ ] **Veredicto final** explícito (`FORTIFIED` | `CONDITIONAL` | `BREACHED`) con su origen: `CONSENSO (A=B)` o `TIEBREAKER (C)` *(mapea Gherkin: "consenso de 2 jueces" y "veredicto final es el de Judge C")*
- [ ] **Razón del desacuerdo** redactada en la sección Tiebreaker cuando hubo discrepancia *(mapea Gherkin: "la razón del desacuerdo explicada")*
- [ ] **Acciones requeridas antes de merge** — lista numerada de ítems concretos derivados del veredicto
- [ ] **Sección "Adversarial Risk Assessment"** incorporada al artefacto host cuando el modo es `/plan --adversarial` o `/sdd-spec --adversarial` (review sobre el plan/spec, NO sobre código) *(mapea Gherkin: "el output incluye sección Adversarial Risk Assessment")*
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1                    Phase 2              Phase 3                Phase N+1
(Load)   →   (DUAL BLIND JUDGES)    →   (COMPARE)        →   (TIEBREAKER cond.)  →   (Session)
             Judge-A ┐ PARALELO          ¿A == B?             SOLO si A != B:
             Judge-B ┘ ciegos            ├─ sí → consenso     Judge-C (Opus) con
             (claude-sonnet)             │      (firme)        transcripts A+B
                                         └─ no → Phase 3       veredicto final = C
```

---

## CASTLE ACTIVO: C·A·S·T·_·_

> Modo adversarial sobre revisión. Hereda el foco del comando host y lo intensifica. Ver `skills/_shared/castle-capas.md` (fila `review` como base).

- **C (Contracts)**: cada juez verifica consistencia de contratos/interfaces del target.
- **A (Architecture)**: cada juez evalúa decisiones de diseño y dependencias.
- **S (Security)**: foco reforzado — el caso de uso central es detectar riesgos sutiles (prompt injection, SQL injection, exfiltración) que un solo revisor pasaría por alto. En `/ai-safety --adversarial` es la capa primaria.
- **T (Testing)**: el protocolo dual-blind ES testing adversarial del propio juicio.

Gate mínimo: **CONDITIONAL**. El veredicto final del skill = el veredicto consensuado (A=B) o el de Judge-C (tiebreaker).

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — primario. Puede invocar `--adversarial` en cualquier revisión de seguridad AI. El contrato `ml-engineer-security.md` define cuándo es OBLIGATORIO (no opt-in) para safety layers.
- **@security** — consumidor del veredicto adversarial. Un `BREACHED` adversarial sobre un endpoint LLM es veto de merge.
- **@reviewer** — coordina la síntesis del reporte final cuando el host es `/review`.

> Los tres jueces (A, B, C) son sub-agentes del PROTOCOLO, no agentes King. A y B usan `claude-sonnet`; C usa `claude-opus`.

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto con `mem_context({ topic_key: 'ai_session', limit: 5 })` — recuperar vetos y veredictos adversariales previos sobre el mismo target
2. [ ] `mem_search({ query: 'adversarial review verdict {target}', tags: ['review', 'adversarial'], limit: 3 })` — no re-litigar hallazgos ya resueltos
3. [ ] Resolver el MODO host (`review` | `plan` | `sdd-spec` | `ai-safety`) y el TARGET concreto (diff, plan, spec, o safety layer)

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §8.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivo.
> Justificación: entry point liviano; el protocolo detallado de jueces se carga on-demand según la fase activa.

| Fase | Ancla / Sub-archivo |
|------|---------------------|
| Phase 1: Dual Blind Judges (A + B en paralelo) | [PHASES.md#phase-1-dual-blind-judges](PHASES.md) |
| Phase 2: Compare Verdicts (consenso o discrepancia) | [PHASES.md#phase-2-compare-verdicts](PHASES.md) |
| Phase 3: Tiebreaker (Judge-C / Opus, CONDICIONAL) | [PHASES.md#phase-3-tiebreaker-condicional](PHASES.md) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] Judge-A y Judge-B se lanzaron en PARALELO y CIEGOS entre sí (ninguno vio el output del otro)
- [ ] Ambos veredictos (A y B) recibidos y completos
- [ ] Si A == B: NO se invocó Judge-C; el reporte muestra consenso de 2 jueces con evidencia combinada
- [ ] Si A != B: Judge-C (Opus) fue invocado con transcripts de A y B; el veredicto final ES el de C
- [ ] Reporte adversarial con las 3 secciones (Tiebreaker presente solo si hubo discrepancia)
- [ ] Veredicto final explícito con origen (`CONSENSO` | `TIEBREAKER`)
- [ ] Razón del desacuerdo redactada cuando hubo tiebreaker
- [ ] Lista numerada de acciones requeridas antes de merge
- [ ] Si host es `plan`/`sdd-spec`: sección "Adversarial Risk Assessment" incorporada al artefacto
- [ ] Veredicto final y acciones pre-merge persistidos en `.king/audit/YYYY-MM-DD.jsonl`
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Verdict Origin | `CONSENSO (A=B)` \| `TIEBREAKER (C)` |
| Judges Used | `A+B` (consenso) \| `A+B+C` (tiebreaker) |
| Artifacts | _reporte adversarial + acciones pre-merge, o "None"_ |
| Next Recommended | `/fix` (si BREACHED) \| `/merge` (si FORTIFIED) \| permanecer en host |
| Risks | _hallazgos sin remediar, costo de tiebreaker, o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir el veredicto final con `mem_save({ scope })` EN EL MOMENTO (origen consenso/tiebreaker, razón del desacuerdo si aplica)
2. [ ] Registrar la ejecución del protocolo: `mem_save({ topic_key: 'ai_audit', tags: ['review', 'adversarial', '{mode}', '{target}'] })`
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — el `include_costs` captura el costo del tiebreaker Opus cuando se invocó. Engram first-class
4. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Veredicto final `BREACHED` | `/fix` para remediar las acciones pre-merge antes de re-juzgar |
| Veredicto final `CONDITIONAL` | Resolver acciones requeridas, luego re-ejecutar el modo `--adversarial` |
| Veredicto final `FORTIFIED` (consenso o tiebreaker) | `/merge` — el target pasó el escrutinio adversarial |
| Host era `plan`/`sdd-spec` con `BREACHED` | Volver al host, incorporar el "Adversarial Risk Assessment" y replanificar |
| Host era `ai-safety --adversarial` con `BREACHED` | Permanecer en `/ai-safety`, reforzar el safety layer (veto `@security`) |

---

> 📚 Para el protocolo detallado de cada juez, formato del reporte de 3 secciones, prompts de A/B/C y matriz de comparación de veredictos: ver [PHASES.md](PHASES.md) y [REFERENCE.md](REFERENCE.md).
