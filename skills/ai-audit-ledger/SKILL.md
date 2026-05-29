---
name: ai-audit-ledger
version: 1.0
api_version: 1.0.0
description: "Skill que audita las ACCIONES DEL AI del proyecto: tokens, agentes, fases SDD, vetos, costos y patologías de comportamiento (loop, runaway agent, role drift, cost spike). Lee el ledger NDJSON en .king/audit/ y produce reportes de token attribution, cost por agente, veto-rate por fase y pathology report. Usar cuando se necesite: auditar acciones de un agente AI, detectar loops o runaway agents, atribuir costo de tokens por feature, role drift, cost spike, veto-rate por fase, exportar audit a CSV para compliance, o consultar el AI Audit Ledger. NO audita la salud del framework (eso es king-core/audit)."
---

# /ai-audit-ledger — AI Audit Ledger

Skill que construye y consulta el **AI Audit Ledger**: el log estructurado de las *acciones del AI* sobre el proyecto. Cada ejecución de tool de cada agente emite un span NDJSON (`.king/audit/YYYY-MM-DD.jsonl`) con `agent_id`, `tool_name`, `tokens_estimated`, `phase`, `feature`, `result_status` y `input_hash`. Sobre ese ledger, el skill detecta **patologías de comportamiento AI** (loop, runaway agent, role drift, cost spike), atribuye costos y vetos, y exporta para compliance. El ledger ES el log de seguridad y auditoría de lo que el AI hizo, no de cómo está el framework.

> **Diferenciación CLAVE** — Este skill NO es `king-core/audit`. `king-core/audit` audita la **salud del framework** (LOAD-INDEX, cross-references, agentes/skills/hooks instalados, Health Score). `ai-audit-ledger` audita las **acciones del AI** (qué hizo cada agente, cuántos tokens gastó, en qué fase, con qué resultado, y si su comportamiento es patológico). Son concerns ortogonales: uno mira el edificio, el otro mira lo que los trabajadores hicieron dentro.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/domain/engram-integration.md` | El ledger persiste en Engram (`topic_key: ai_audit`, tags `[agent_id, phase, feature]`), pattern Engram first-class (Phase 0 / N+1), fallback Chronicle | Sí | framework |
| `knowledge/_inject/llm-integration-essentials.md` | Campos de `llm_usage` (tokens, modelo, costo), precios por modelo, columnas PII prohibidas en el log de costo | No | framework |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → reportar al usuario y actuar según se indica.

- [ ] No existe `.king/audit/` ni ninguna línea NDJSON (`*.jsonl`) en el proyecto → ⚠️ NO abortar: advertir `"Sin eventos en el ledger todavía. Instalando el hook emit-span.sh y creando .king/audit/ — los reportes quedarán vacíos hasta que haya acciones registradas."` y continuar instalando el hook (degradación grácil)
- [ ] El hook `PostToolUse otel-trace-emit` (`hooks/ai-audit/emit-span.sh`) NO está registrado en `hooks/hooks.json` → ⛔ instalar/registrar el hook ANTES de generar reportes; sin él el ledger no se alimenta y la auditoría es ciega
- [ ] Se pasó `--export csv` pero el ledger del período solicitado está vacío → ⛔ no generar un CSV vacío silencioso: reportar `"No hay entradas para el período <X>"` y abortar el export (el Gherkin exige >= 100 entradas para un export válido)

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA mutar ni reescribir una línea ya escrita en `.king/audit/*.jsonl` — el ledger es **append-only e inmutable**; corregir un evento se hace anexando un evento correctivo, jamás editando el original
- NUNCA registrar `prompt_text`, `response_text`, `user_ip` ni PII en el ledger — solo metadata de acción (agente, tool, tokens, costo, fase, feature, resultado, hash)
- NUNCA permitir que la emisión de un span bloquee un tool — `emit-span.sh` SALE 0 siempre; auditar el AI no puede romper el trabajo del AI
- NUNCA confundir este skill con `king-core/audit` — este audita ACCIONES del AI; aquel audita la SALUD del framework. NUNCA reportar Health Score aquí
- NUNCA declarar una patología sin su evidencia en el ledger — toda detección (loop/runaway/drift/spike) cita las líneas NDJSON que la sustentan (Logging es la capa CASTLE activa)
- NUNCA exportar un CSV con un formato que rompa en Excel/Sheets — header obligatorio, comas escapadas, UTF-8 sin BOM (Gherkin Scenario 2)

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE producir/consumir en el proyecto del usuario.

- [ ] `hooks/ai-audit/emit-span.sh` registrado en `hooks/hooks.json` como `PostToolUse otel-trace-emit` (el ledger se alimenta solo)
- [ ] Hook `Stop session-summary-force` registrado en `hooks/hooks.json` (emite un recordatorio por stdout para cerrar con `mem_session_summary` si el agente no lo llamó — un hook no invoca la MCP tool directamente)
- [ ] `.king/audit/YYYY-MM-DD.jsonl` — eventos NDJSON append-only (un span de acción AI por línea)
- [ ] `.king/audit/reports/tokens-by-feature.md` — atribución de tokens por feature
- [ ] `.king/audit/reports/cost-attribution-by-agent.md` — costo estimado atribuido por agente
- [ ] `.king/audit/reports/veto-rate-by-phase.md` — tasa de vetos (`result_status: veto`) por fase SDD
- [ ] `.king/audit/reports/pathology-report.md` — patologías detectadas (loop, runaway, role drift, cost spike) con evidencia
- [ ] Export `.king/audit/reports/<period>-cost-attribution.csv` cuando se pide `--export csv` (columnas: agent_id, tool_name, tokens_estimated, cost_usd, phase, feature)
- [ ] Cada acción de agente persistida en Engram (`topic_key: ai_audit`, tags `[agent_id, phase, feature]`)
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0       Phase 1            Phase 2-3                    Phase 4          Phase N+1
(Load)   →   (HOOK SETUP)  →   (INGEST + PATHOLOGY SCAN)  →  (REPORTS+EXPORT) → (Session)
             emit-span +        Parsear NDJSON              4 reportes .md
             session-force      Detectar 4 patologías       CSV compliance
```

---

## CASTLE ACTIVO: _·_·S·_·L·_

> Security (detección de role drift / patologías de comportamiento) + Logging (el ledger ES el log estructurado de acciones AI). Ver `skills/_shared/castle-capas.md`.

- **S (Security)**: la detección de patologías es un control de seguridad de comportamiento. **Role drift** (un agente ejecuta acciones fuera de su scope declarado) y **runaway agent** (costo descontrolado sin progreso) son señales de un AI que se sale de su mandato. `@security` consume el `pathology-report.md` y `@ml-engineer` emite el veto cuando una patología cruza el umbral de acción.
- **L (Logging/Observability)**: el ledger NDJSON es el output principal del skill — el log estructurado, append-only e inmutable de toda acción AI. La trazabilidad (qué agente, qué tool, cuántos tokens, qué fase, qué resultado) es la materia prima de todos los reportes y de la auditoría de compliance.

Gate mínimo: **CONDITIONAL** (FORTIFIED solo si el hook alimenta el ledger, los 4 reportes se generan y el pathology scan corre con evidencia citada).

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — primario. Posee la lógica de detección de patologías (loop, runaway, cost spike) sobre el uso de tokens. Emite el **veto** cuando una patología cruza su umbral de acción (loop detection → veto; runaway → pausa + escalación). Valida la atribución de costos del `cost-attribution-by-agent.md`.
- **@security** — consume `pathology-report.md`. Posee la capa S: evalúa **role drift** (acciones fuera de scope) como riesgo de seguridad de comportamiento y verifica que el ledger no contenga PII.
- **@developer** — registro del hook en `hooks/hooks.json`, wiring del `emit-span.sh` y formato del export CSV.

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI con `mem_context({ topic_key: 'ai_audit', limit: 5 })` — recuperar acciones, vetos y patologías de sesiones anteriores
2. [ ] `mem_search({ query: 'audit ledger pathology loop runaway role drift cost spike veto', tags: ['audit', 'pathology'], limit: 3 })` — no re-reportar una patología ya resuelta sin evidencia nueva
3. [ ] Si standalone: continuar sin workflow. Si invocado desde `/qa` o `/review`: heredar workflow context y filtros (`--agent`, `--phase`, `--feature`)

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §4 (AI Audit Ledger en Engram) y §8.

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~liviano; sub-archivos cargados on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Hook Setup & Ledger Bootstrap | [PHASES.md#phase-1-hook-setup--ledger-bootstrap](PHASES.md#phase-1-hook-setup--ledger-bootstrap) |
| Phase 2: Ingest & Normalize | [PHASES.md#phase-2-ingest--normalize](PHASES.md#phase-2-ingest--normalize) |
| Phase 3: Pathology Scan | [PHASES.md#phase-3-pathology-scan](PHASES.md#phase-3-pathology-scan) |
| Phase 4: Reports & Export | [PHASES.md#phase-4-reports--export](PHASES.md#phase-4-reports--export) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] `hooks/ai-audit/emit-span.sh` registrado en `hooks/hooks.json` como `PostToolUse otel-trace-emit` y el hook `Stop session-summary-force` registrado
- [ ] `.king/audit/YYYY-MM-DD.jsonl` existe y recibe líneas NDJSON válidas (un span por acción AI)
- [ ] El ledger se trató como append-only — ninguna línea existente fue mutada
- [ ] `.king/audit/reports/tokens-by-feature.md` generado
- [ ] `.king/audit/reports/cost-attribution-by-agent.md` generado
- [ ] `.king/audit/reports/veto-rate-by-phase.md` generado
- [ ] `.king/audit/reports/pathology-report.md` generado con las 4 patologías evaluadas y evidencia citada
- [ ] Loop detection probada: mismo tool >5 veces en 2 min con mismo `input_hash` → patología `loop_detection` registrada + veto emitido (Gherkin Scenario 1)
- [ ] Si `--export csv`: CSV generado con columnas `agent_id, tool_name, tokens_estimated, cost_usd, phase, feature`, UTF-8 sin BOM, importable en Excel/Sheets (Gherkin Scenario 2)
- [ ] Ninguna línea del ledger contiene PII (`prompt_text`/`response_text`/`user_ip`)
- [ ] Acciones persistidas en Engram (`topic_key: ai_audit`, tags `[agent_id, phase, feature]`)
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _4 reportes en `.king/audit/reports/` + CSV de export, o "None"_ |
| Next Recommended | `/cost-report` \| `/qa --standard` \| permanecer en `/ai-audit-ledger` |
| Risks | _patología sin remediar (loop/runaway/drift/spike), ledger sin alimentar, o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir cada hallazgo de auditoría con `mem_save({ scope })` EN EL MOMENTO (patología detectada, veto emitido, agente con cost spike)
2. [ ] Registrar la acción del agente en el ledger semántico: `mem_save({ topic_key: 'ai_audit', tags: ['{agent_id}', '{phase}', '{feature}'] })` — los tres tags son obligatorios y posicionales (ver `knowledge/domain/engram-integration.md` §4)
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — Engram first-class (M-18). `include_costs: true` es crítico: persiste el costo agregado de la sesión que el ledger atribuye
4. [ ] Tras llamar `mem_session_summary`, tocar `.king/audit/.session-summary-done` para que el hook `Stop session-summary-force` NO lo fuerce de nuevo
5. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo (el ledger NDJSON sigue siendo la fuente cruda)

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Ledger alimentándose y reportes generados sin patologías críticas | `/cost-report` para análisis de cost attribution profundo (trend, cost per merged PR) |
| Se necesita validar calidad pre-merge | `/qa --standard` (CASTLE layer L/S ya tiene el ledger y el pathology report) |
| Se detectó loop/runaway/role drift sin remediar | Permanecer en `/ai-audit-ledger`, escalar la patología antes de continuar |
| El proyecto aún no tiene el hook instalado | Permanecer en `/ai-audit-ledger` Phase 1 — sin el hook el ledger está ciego |

---

> 📚 Para el SCHEMA JSONL completo de cada entrada del ledger, la tabla de patologías (señales + acciones), el formato de export CSV, ejemplos de reportes y la cobertura de los escenarios Gherkin: ver [REFERENCE.md](REFERENCE.md).
