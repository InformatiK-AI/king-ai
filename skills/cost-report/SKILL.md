---
name: cost-report
version: 1.0
api_version: 1.0.0
description: "Skill que LEE el AI Audit Ledger (.king/audit/*.jsonl) y produce reportes de cost attribution: top features por costo, trend mensual por agente con sparkline ASCII, cost per merged PR, predictive cost del próximo /build y anomalías (>3x el promedio de su categoría). Exporta a FinOps JSON (compatible Vantage/Cloudability/FinOps Open Cost and Usage Spec) y CSV. Usar cuando se necesite: reporte de costo AI, cost attribution, top features por costo, trend mensual de tokens, costo por PR mergeado, predecir costo del próximo build, detectar anomalías de costo, export FinOps, o ejecutar /cost-report."
---

# /cost-report — AI Cost Attribution Report

Skill que **CONSUME** el AI Audit Ledger producido por `/ai-audit-ledger` (`/ai-cost-gate` y `/ai-observability` también lo alimentan) y lo transforma en reportes de cost attribution accionables para el founder y el equipo FinOps. Lee el NDJSON append-only de `.king/audit/YYYY-MM-DD.jsonl` (schema `king.ai_audit.v1`), agrega tokens y costo por feature/agente/PR, dibuja el trend mensual con **sparkline ASCII**, estima el costo del próximo `/build` (solo con historial suficiente) y detecta **anomalías** (>3x el promedio de su categoría). Produce un reporte human-readable `.md`, un **export FinOps JSON** (compatible Vantage / Cloudability / FinOps Open Cost and Usage Spec) y un CSV para hojas de cálculo. Este skill es READ-ONLY sobre el ledger: NUNCA escribe en `.king/audit/`.

> **Diferenciación CLAVE** — `/cost-report` es el **consumidor analítico**; `/ai-audit-ledger` es el **productor**. El ledger detecta patologías de comportamiento (loop, runaway, drift, spike) en el momento; `/cost-report` hace el análisis de costo agregado a posteriori (trend mensual, cost per PR, predictive). Ambos leen el mismo schema JSONL — la coherencia del schema es OBLIGATORIA. No hay solapamiento de outputs: el ledger escribe en `.king/audit/reports/`, este skill en `.king/reports/cost/`.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1), `include_costs: true` en session summary, `topic_key: ai_audit` (tags `[agent_id, phase, feature]`) para histórico de builds, fallback Chronicle | Sí | framework |
| `knowledge/_inject/llm-integration-essentials.md` | Precios por modelo (USD por token) para convertir `tokens_estimated` → `cost_usd`, campos `llm_usage`, columnas PII prohibidas | Sí | framework |
| `skills/ai-audit-ledger/REFERENCE.md` | Schema JSONL del ledger (`king.ai_audit.v1`) que este skill DEBE consumir EXACTAMENTE — coherencia obligatoria del schema | Sí | skill (productor) |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Checkeadas UNA vez, globalmente, ANTES de Phase 0. Si alguna es TRUE → reportar al usuario y actuar según se indica.

- [ ] No existe `.king/audit/` ni ninguna línea NDJSON (`*.jsonl`) para el período solicitado → ⛔ no hay datos que reportar: informar `"Sin eventos en el ledger para el período <X>. Ejecutar acciones AI o /ai-audit-ledger primero."` y abortar (no generar reportes vacíos silenciosos)
- [ ] Se pasó `--export finops` pero el ledger del período solicitado está vacío → ⛔ no generar un JSON vacío silencioso: reportar `"No hay entradas para el período <X>"` y abortar el export (Gherkin Scenario 3 exige datos del período)
- [ ] Se pasó `--predict` (o sección predictive activa) y hay `< 5 builds` históricos → ⚠️ NO abortar: el reporte se genera, pero la sección Predictive Cost indica `"Insuficiente historial (<N> builds) para predicción confiable — mínimo 5"` y NO muestra estimación (Gherkin Scenario 2)

### ABSOLUTE RESTRICTIONS
> 🚫 Prohibiciones activas durante toda la ejecución. Violación = CASTLE BREACHED.

- NUNCA escribir, mutar ni reescribir una línea de `.king/audit/*.jsonl` — este skill es READ-ONLY sobre el ledger; el ledger es append-only e inmutable, propiedad de `/ai-audit-ledger`
- NUNCA emitir una predicción de costo con `< 5 builds` históricos — indicar `"Insuficiente historial"` y omitir la estimación (un número inventado sin baseline es peor que no dar número)
- NUNCA incluir `prompt_text`, `response_text`, `user_ip` ni PII en ningún reporte ni en el export FinOps — el ledger no los contiene y este skill tampoco los deriva; solo metadata de acción (capa S)
- NUNCA generar un export FinOps que no valide contra el FinOps Open Cost and Usage Spec — cada entrada DEBE tener `provider`, `service`, `cost_center`, `tags`, `usage` y `cost_usd` (Gherkin Scenario 3)
- NUNCA inventar el schema del ledger — los campos se leen EXACTAMENTE como los define `skills/ai-audit-ledger/REFERENCE.md` (`king.ai_audit.v1`); cualquier divergencia rompe la coherencia productor-consumidor
- NUNCA escribir un CSV con formato que rompa en Excel/Sheets — header obligatorio en la primera fila, comas internas escapadas con comillas dobles, UTF-8 **sin BOM**
- NUNCA declarar una anomalía sin su baseline — toda anomalía cita el promedio de su categoría y el factor (>3x) que la dispara; sin baseline no se declara (evita falso positivo)

### REQUIRED OUTPUTS
> 📦 Artefactos que el skill DEBE producir en el proyecto del usuario.

- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.md` — reporte human-readable con las 5 secciones (top 5 features, trend mensual con sparkline ASCII, cost per merged PR, predictive cost, anomalías)
- [ ] `.king/reports/cost/YYYY-MM-DD-finops-export.json` — export FinOps compatible Vantage/Cloudability/FinOps Open Cost and Usage Spec (`provider`, `service`, `cost_center`, `tags`, `usage`, `cost_usd`, `period`)
- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.csv` — export para hojas de cálculo (UTF-8 sin BOM, header obligatorio)
- [ ] Sección **Top 5 features por costo** (tokens + USD estimado)
- [ ] Sección **Trend mensual por agente** con sparkline ASCII
- [ ] Sección **Cost per merged PR** (tokens entre `/plan` y merge)
- [ ] Sección **Predictive cost** (estimación solo con `>= 5 builds`; si no, `"Insuficiente historial"`)
- [ ] Sección **Anomalías** (llamadas/categorías que exceden 3x el promedio de su categoría)
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1            Phase 2-3                      Phase 4              Phase N+1
(Load)   →   (READ LEDGER)  →   (AGGREGATE + PREDICT)       →  (RENDER + EXPORT)  →  (Session)
             Parsear NDJSON       Top5 + trend + per-PR          report.md
             del período          Predictive + anomalías         finops.json + csv
```

---

## CASTLE ACTIVO: _·_·_·_·L·E

> Logging (lee y agrega el ledger — el log estructurado de acciones AI) + Environment (cost attribution / FinOps por feature, agente, PR y cost_center). Ver `skills/_shared/castle-capas.md`.

- **L (Logging)**: el skill CONSUME el ledger NDJSON (`king.ai_audit.v1`). Toda cifra del reporte se deriva de líneas reales del ledger y cita su origen (período, archivos `*.jsonl` leídos). Las anomalías citan la evidencia (`ts`/categoría/factor). El skill es READ-ONLY: no altera la cadena de auditoría.
- **E (Environment)**: cost attribution y FinOps. El costo se atribuye por `feature`, `agent_id`, PR y `cost_center` para que el founder sepa **dónde** se gasta. El export FinOps integra con herramientas de costo cloud (Vantage/Cloudability) bajo el FinOps Open Cost and Usage Spec. Precios por modelo desde `llm-integration-essentials.md`, nunca hardcodeados.

Gate mínimo: **CONDITIONAL** (FORTIFIED solo si el export FinOps valida contra el spec y las 5 secciones se generan con datos del ledger).

---

## AGENTES INVOLUCRADOS

- **@ml-engineer** — primario. Valida la conversión `tokens_estimated → cost_usd` (precios por modelo correctos), el algoritmo de predictive cost (baseline >= 5 builds) y los umbrales de anomalía (>3x promedio de categoría). Posee la capa L/E del dominio de costo AI.
- **@developer** — integración con GitFlow para `cost per merged PR` (correlación `/plan` → merge vía `session_id`/`feature`), generación de los archivos en `.king/reports/cost/`, formato CSV importable.
- **@security** — consultado para garantizar que ningún reporte ni el export FinOps filtre PII; solo metadata de acción agregada (capa S del ledger heredada).

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI con `mem_context({ topic_key: 'ai_session', limit: 5 })` — recuperar decisiones de costo previas (precios por modelo adoptados, cost_center, umbral de anomalía)
2. [ ] `mem_search({ query: 'cost report builds históricos tokens por feature predictive cost', topic_key: 'ai_audit', tags: ['build'], limit: 5 })` — recuperar el **historial de builds** (alimenta el baseline de predictive cost) y costos previos por agente
3. [ ] Si standalone: continuar sin workflow. Si invocado desde `/build`, `/qa` o tras `/ai-audit-ledger`: heredar workflow context (período, `--feature`, `--agent`)

> Delegado a `skills/session-management/SKILL.md` → Phase 0. Pattern Engram: ver `knowledge/domain/engram-integration.md` §8. El histórico de builds para predictive cost vive en `topic_key: ai_audit` (§4).

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~liviano; sub-archivos cargados on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Read Ledger ([PHASES.md#phase-1-read-ledger](PHASES.md#phase-1-read-ledger)) | [PHASES.md](PHASES.md) |
| Phase 2: Aggregate (Top 5 + Trend + Cost per PR) ([PHASES.md#phase-2-aggregate-top-5--trend--cost-per-pr](PHASES.md#phase-2-aggregate-top-5--trend--cost-per-pr)) | [PHASES.md](PHASES.md) |
| Phase 3: Predictive Cost + Anomalies ([PHASES.md#phase-3-predictive-cost--anomalies](PHASES.md#phase-3-predictive-cost--anomalies)) | [PHASES.md](PHASES.md) |
| Phase 4: Render + Export (md + finops.json + csv) ([PHASES.md#phase-4-render--export-md--finopsjson--csv](PHASES.md#phase-4-render--export-md--finopsjson--csv)) | [PHASES.md](PHASES.md) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] El ledger del período fue leído desde `.king/audit/*.jsonl` (READ-ONLY, sin escritura)
- [ ] Sección **Top 5 features por costo** con tokens + USD estimado generada
- [ ] Sección **Trend mensual por agente** con sparkline ASCII (un sparkline por agente, normalizado a 8 niveles)
- [ ] Sección **Cost per merged PR** (tokens entre `/plan` y merge correlacionados por `session_id`/`feature`)
- [ ] Sección **Predictive cost**: estimación SOLO si `>= 5 builds`; si no, `"Insuficiente historial (<N> builds) para predicción confiable — mínimo 5"` sin número
- [ ] Sección **Anomalías**: categorías/llamadas > 3x el promedio de su categoría, con baseline citado (o "Sin anomalías")
- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.md` escrito
- [ ] `.king/reports/cost/YYYY-MM-DD-finops-export.json` escrito y validado contra el FinOps Open Cost and Usage Spec (cada entrada con `provider`, `service`, `cost_center`, `tags`, `usage`, `cost_usd`)
- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.csv` escrito (UTF-8 sin BOM, header en la primera fila)
- [ ] Ninguna línea de `.king/audit/*.jsonl` fue modificada (skill READ-ONLY)
- [ ] Ningún reporte ni export contiene PII
- [ ] Session document creado en `.king/sessions/`

---

## Execution Summary

> Completar tras FINAL CHECKPOINT. Ver `skills/_shared/skill-envelope.md`.

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _`YYYY-MM-DD-{cost-report.md, finops-export.json, cost-report.csv}` en `.king/reports/cost/`, o "None"_ |
| Next Recommended | `/ai-cost-gate` \| `/ai-audit-ledger --pathologies` \| permanecer en `/cost-report` |
| Risks | _predictive omitido por historial insuficiente, anomalías detectadas, ledger parcial del período, o "None"_ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1.

### MUST DO
1. [ ] Persistir cada decisión de análisis con `mem_save({ scope })` EN EL MOMENTO (precios por modelo usados, `cost_center`, umbral de anomalía adoptado, baseline de predictive cost calculado)
2. [ ] Registrar la ejecución del reporte como acción de agente: `mem_save({ topic_key: 'ai_audit', tags: ['ml-engineer', '{phase}', '{feature}'] })` — y persistir el costo total del período como build histórico (alimenta el baseline de futuros `--predict`)
3. [ ] **OBLIGATORIO** cerrar con `mem_session_summary({ include_decisions: true, include_costs: true })` — Engram first-class (M-18, ver `knowledge/domain/engram-integration.md` §8). `include_costs: true` es crítico aquí: persiste el costo agregado del período para el histórico de builds que el predictive cost consume
4. [ ] Si Engram no disponible: degradar a Chronicle con advertencia, NO romper el flujo (el reporte se basa en el NDJSON crudo, que funciona sin Engram)

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Reporte generado y anomalías detectadas | `/ai-cost-gate` para imponer budget/breaker sobre las features que disparan el costo |
| Se detectaron patologías de comportamiento (no solo costo) | `/ai-audit-ledger --pathologies` para el detalle de loop/runaway/drift/spike |
| Predictive cost omitido por `< 5 builds` | Acumular más builds y re-ejecutar `/cost-report --predict` cuando haya historial suficiente |
| Export FinOps generado | Importar `finops-export.json` en Vantage/Cloudability para el dashboard de costo cloud consolidado |
| El ledger está vacío para el período | Ejecutar acciones AI o `/ai-audit-ledger` primero — no hay datos que reportar |

---

> 📚 Para el formato exacto de cada sección del reporte, el FinOps export JSON schema, el algoritmo de sparkline ASCII, el algoritmo de predictive cost, la detección de anomalías, el formato CSV y la cobertura Gherkin: ver [REFERENCE.md](REFERENCE.md).
