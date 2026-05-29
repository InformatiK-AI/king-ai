---
name: ai-safety
version: 1.0
api_version: 1.0.0
description: "Skill para añadir una capa de seguridad LLM completa a integraciones existentes. Usar cuando se necesite: proteger un endpoint LLM, prevenir prompt injection, redactar PII, content moderation, jailbreak testing, safety pipeline, cumplir OWASP LLM Top 10, o ejecutar tests adversariales con --adversarial."
---

# /ai-safety — AI Safety Layer

Skill standalone que documenta cómo generar una capa de seguridad para CUALQUIER integración LLM del proyecto del usuario: `input guard → process → output guard`. Cubre OWASP LLM Top 10 con scope v1 acotado a **prompt injection (LLM01), PII (LLM02), content moderation y system prompt leakage (LLM07)**. Hallucination detection (LLM09) llega en v2.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/ai-safety-patterns.md` | OWASP LLM Top 10, patrones de injection, PII tiers, jailbreak taxonomy, gates | Sí | framework |
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1) | Sí | framework |
| `knowledge/_inject/llm-integration-essentials.md` | Regla de oro: nunca concatenar input al system prompt | No (se creará) | framework |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → abortar y reportar al usuario.

- [ ] No existe ninguna integración LLM en el proyecto (no hay `*-client.ts` ni llamada a un SDK LLM) → la safety layer no tiene qué proteger; recomendar `/llm-integration` primero
- [ ] El gate `pii_leak_rate == 0` NO se puede satisfacer (PII detectada sin redactar en `pii-test-cases.json`) → ⛔ BLOQUEO INMEDIATO E INSUPERABLE sin fix explícito (veto `@security` bloqueante)
- [ ] El gate `jailbreak_block_rate >= 95` no se alcanza contra `adversarial-prompts.json` → ⛔ build bloqueado hasta remediar
- [ ] Se detecta un endpoint LLM sin safety pipeline al ejecutar CASTLE layer S → CASTLE BREACHED, merge bloqueado

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA concatenar el input del usuario al system prompt — usar roles explícitos y envolver en `<user_input>...</user_input>`
- NUNCA enviar PII al embedding o al vector DB sin redactar antes (riesgo crítico, gate `pii_leak_rate: 0`)
- NUNCA confiar en una sola capa de detección de injection — pattern matching Y LLM-as-judge, siempre las dos
- NUNCA usar la salida del LLM en HTML/SQL/shell sin sanitizar (LLM05)
- NUNCA expandir el scope v1 a hallucination detection — es v2; documentarlo, no implementarlo
- NUNCA acoplar el cliente de moderación a una API concreta — adapter pattern obligatorio

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE documentar cómo generar en el proyecto del usuario (los `.ts` NO se crean aquí).

- [ ] `src/ai-safety/prompt-guard.ts` — detección de prompt injection (pattern + LLM judge)
- [ ] `src/ai-safety/pii-redactor.ts` — detección y redacción de PII (regex tier + Presidio tier)
- [ ] `src/ai-safety/hallucination-detector.ts` — stub v1 (implementación real en v2)
- [ ] `src/ai-safety/content-moderator.ts` — moderación vía adapter intercambiable
- [ ] `src/ai-safety/safety-pipeline.ts` — orquestador input guard → process → output guard
- [ ] `safety-config.yaml` — thresholds configurables por feature
- [ ] `tests/ai-safety/adversarial-prompts.json` — >= 50 prompts adversariales (bootstrap ~20 en REFERENCE.md)
- [ ] `tests/ai-safety/pii-test-cases.json` — casos de PII: nombres, emails, SSN, tarjetas
- [ ] `tests/ai-safety/safety.test.ts` — suite que ejecuta ambos gates
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1-2              Phase 3-4                   Phase N+1
(Load)   →   (THREAT-MODEL)     →   (PIPELINE + GATES)      →   (Session)
             Detectar endpoints      Generar guards + config
             Modelar OWASP scope     Tests adversariales + gates
```

---

## CASTLE ACTIVO: _·_·S·T·_·_

> Security primaria + Testing adversarial. Ver `skills/_shared/castle-capas.md`.

- **S (Security)**: gate central del skill. `pii_leak_rate == 0` es veto bloqueante e insuperable. Endpoint LLM sin safety pipeline → BREACHED. Contrato hacia `@security` vía `ml-engineer-security.md` (se crea en B4).
- **T (Testing)**: testing adversarial. `jailbreak_block_rate >= 95` medido contra `adversarial-prompts.json` (50+ casos OWASP) en CI. `--adversarial` conecta con `judgment-day` (B4).

Gate mínimo: **CONDITIONAL** (FORTIFIED solo si ambos gates en PASS).

---

## AGENTES INVOLUCRADOS

- **@security** — primario. Recibe el reporte de safety como contrato. Veto bloqueante si `pii_leak_rate > 0`.
- **@ml-engineer** — validación de patrones LLM, configuración del LLM-as-judge, thresholds.
- **@developer** — documentación de los templates de código a generar en el proyecto.

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI con `mem_context({ topic_key: 'ai_session', limit: 5 })` — recuperar vetos de seguridad y convenciones previas
2. [ ] `mem_search({ query: 'safety layer prompt injection PII', tags: ['security', 'llm'], limit: 3 })` — no re-proponer enfoques ya vetados
3. [ ] Si standalone: continuar sin workflow. Si invocado desde `/build` o `/ai-feature-scaffold`: heredar workflow context

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §8.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~liviano; sub-archivos cargados on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Threat Detection + Phase 2: Threat Model (OWASP scope) | [PHASES.md](PHASES.md) |
| Phase 3: Pipeline Generation + Phase 4: Gates & Adversarial Testing | [PHASES.md](PHASES.md) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] `src/ai-safety/prompt-guard.ts` documentado/generado (pattern + judge, dos capas)
- [ ] `src/ai-safety/pii-redactor.ts` documentado/generado (redacta antes del embedding y en output)
- [ ] `src/ai-safety/content-moderator.ts` documentado/generado (adapter intercambiable)
- [ ] `src/ai-safety/safety-pipeline.ts` documentado/generado (input guard → process → output guard)
- [ ] `src/ai-safety/hallucination-detector.ts` como stub v1 (no implementación completa)
- [ ] `safety-config.yaml` generado con thresholds por feature
- [ ] `tests/ai-safety/adversarial-prompts.json` (>= 50 casos) y `pii-test-cases.json` generados
- [ ] `tests/ai-safety/safety.test.ts` ejecuta ambos gates
- [ ] Gate `pii_leak_rate == 0` PASA (cero tolerancia)
- [ ] Gate `jailbreak_block_rate >= 95` PASA contra el set adversarial
- [ ] Eventos de bloqueo registrados en `.king/audit/YYYY-MM-DD.jsonl`
- [ ] Reporte de safety entregado a `@security` (contrato)
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _archivos de safety generados/documentados, o "None"_ |
| Next Recommended | `/prompt-eval` \| `/qa --standard` \| permanecer en `/ai-safety` |
| Risks | _gate en WARNING, scope v2 pendiente (hallucination), o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir cada decisión de safety con `mem_save({ scope })` EN EL MOMENTO (threshold elegido, proveedor de moderación, vetos)
2. [ ] Registrar acción del agente: `mem_save({ topic_key: 'ai_audit', tags: ['security', '{phase}', '{feature}'] })`
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — Engram first-class
4. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Safety layer instalada y ambos gates PASS | `/prompt-eval` para suite de evals en CI |
| Se necesita validar calidad pre-merge | `/qa --standard` (CASTLE layer S ya tiene el contrato de safety) |
| Gate `pii_leak_rate > 0` o `jailbreak_block_rate < 95` | Permanecer en `/ai-safety`, remediar antes de continuar |
| Se quiere review adversarial profundo del safety layer | `judgment-day` (via `--adversarial`, se conecta en B4) |

---

> 📚 Para formatos de config, schemas, ejemplos de código TS y el bootstrap set adversarial: ver [REFERENCE.md](REFERENCE.md).
