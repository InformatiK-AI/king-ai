# ai-audit-ledger — REFERENCE

> 📚 Documentación. Esta sección NO contiene acciones — schema JSONL del ledger, tabla de patologías (señales + acciones), formato de export CSV, ejemplos de reportes y cobertura Gherkin.
> El ledger persiste en Engram: `knowledge/domain/engram-integration.md` §4 (`topic_key: ai_audit`, tags `[agent_id, phase, feature]`). Costo de tokens: `knowledge/_inject/llm-integration-essentials.md`.

---

## ADR-01: Por qué este skill NO es `king-core/audit`

`king-core/audit` audita la **salud del framework**: LOAD-INDEX, cross-references entre agentes/skills/hooks, Health Score con 6 dimensiones, backlog de mejoras. Su pregunta es *"¿está bien instalado y consistente el framework?"*.

`ai-audit-ledger` audita las **acciones del AI**: qué hizo cada agente, cuántos tokens gastó, en qué fase SDD, con qué resultado, y si su comportamiento es patológico. Su pregunta es *"¿qué hicieron los agentes y se comportaron dentro de su mandato?"*.

Son ortogonales. El primero mira el edificio; el segundo mira lo que los trabajadores hicieron dentro. Por eso el ledger se movió y expandió desde `king-core` a `king-ai` (M-13): el concern de auditar *acciones AI* pertenece al plugin de AI, no al de framework health.

## ADR-02: Ledger append-only e inmutable

`.king/audit/*.jsonl` es NDJSON append-only. Una línea escrita JAMÁS se reescribe. Corregir un evento se hace anexando un evento correctivo (mismo `session_id`, `event: "correction"`), no editando la línea original. Esto preserva la cadena de auditoría para compliance: un auditor puede confiar en que el log no fue alterado a posteriori.

## ADR-03: El hook nunca bloquea el tool

`emit-span.sh` SALE 0 siempre (trap + `|| true` en cada escritura). Auditar lo que el AI hace no puede romper lo que el AI está haciendo. Un fallo de escritura del ledger degrada la auditoría (pierde un span), nunca el trabajo del agente. Por eso el hook es `async: true` en `PostToolUse`.

## ADR-04: Doble persistencia — NDJSON crudo + Engram semántico

El ledger vive en DOS capas complementarias:
- **NDJSON crudo** (`.king/audit/*.jsonl`): log append-only, fuente de verdad inmutable, base de los reportes y del export CSV. Funciona sin Engram.
- **Engram semántico** (`topic_key: ai_audit`): capa consultable por similaridad vectorial, con tags `[agent_id, phase, feature]`. Permite queries del tipo *"todas las decisiones del ml-engineer en build de auth"*.

Si Engram cae, el NDJSON sigue siendo la fuente cruda y el skill degrada a Chronicle con advertencia (ver `engram-integration.md` §5). NUNCA se aborta por Engram caído.

---

## SCHEMA JSONL — entrada del ledger (`king.ai_audit.v1`)

Cada línea de `.king/audit/YYYY-MM-DD.jsonl` es un objeto JSON independiente (NDJSON). El `emit-span.sh` emite eventos `tool_span`; el skill anexa eventos `pathology` y `correction`.

### Campos comunes a toda entrada

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `ts` | string (ISO-8601 UTC) | Sí | Timestamp del evento, p.ej. `2026-05-28T14:30:01Z` |
| `schema` | string | Sí | Versión del schema: `king.ai_audit.v1` |
| `event` | string | Sí | `tool_span` \| `pathology` \| `veto` \| `correction` |
| `agent_id` | string | Sí | Agente que actuó (`ml-engineer`, `developer`, ...) |
| `phase` | string | Sí | Fase SDD: `plan` \| `build` \| `qa` \| `review` \| `unknown` |
| `feature` | string | Sí | Feature en alcance (`auth`, `rag-search`, `unknown`) |
| `session_id` | string | Sí | ID de sesión que correlaciona spans |

### Campos del evento `tool_span` (emitido por `emit-span.sh`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `tool_name` | string | Tool ejecutado (`Bash`, `Edit`, `Read`, ...) |
| `duration_ms` | number | Duración del tool en ms |
| `tokens_estimated` | number | Tokens estimados consumidos por la acción |
| `result_status` | string | `success` \| `error` \| `veto` \| `unknown` |
| `input_hash` | string | Hash (16 chars) de `tool+agent+phase+feature` — base de loop detection |

```json
{"ts":"2026-05-28T14:30:01Z","schema":"king.ai_audit.v1","event":"tool_span","agent_id":"ml-engineer","tool_name":"Bash","duration_ms":1234,"tokens_estimated":820,"result_status":"success","phase":"build","feature":"auth","session_id":"sess-001","input_hash":"173e226db4e8cd24"}
```

### Campos del evento `pathology` (anexado por el skill, Phase 3)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `pathology` | string | `loop_detection` \| `runaway_agent` \| `role_drift` \| `cost_spike` |
| `severity` | string | `warning` \| `veto` \| `escalation` |
| `signal` | string | Descripción de la señal que disparó la detección |
| `evidence` | array<string> | Lista de `ts`/`input_hash` de los spans que la sustentan |
| `action` | string | Acción tomada (`veto`, `pause`, `warning`, `alert_finops`) |

```json
{"ts":"2026-05-28T14:32:10Z","schema":"king.ai_audit.v1","event":"pathology","agent_id":"ml-engineer","pathology":"loop_detection","severity":"veto","signal":"tool Bash llamado 6 veces en 90s con input_hash=173e226db4e8cd24","evidence":["2026-05-28T14:31:01Z","2026-05-28T14:31:18Z","2026-05-28T14:31:35Z","2026-05-28T14:31:52Z","2026-05-28T14:32:05Z","2026-05-28T14:32:09Z"],"action":"veto","phase":"build","feature":"auth","session_id":"sess-001"}
```

### Campos del evento `veto`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `verdict` | string | `BREACHED` \| `CONDITIONAL` |
| `reason` | string | Motivo del veto |
| `issued_by` | string | Agente que emitió el veto (`ml-engineer`, `security`) |

```json
{"ts":"2026-05-28T14:32:11Z","schema":"king.ai_audit.v1","event":"veto","agent_id":"ml-engineer","verdict":"CONDITIONAL","reason":"Posible loop detectado — verificar condición de salida","issued_by":"ml-engineer","phase":"build","feature":"auth","session_id":"sess-001"}
```

> **PII prohibida**: el schema NO incluye `prompt_text`, `response_text`, `user_ip` ni ningún identificador personal. Solo metadata de acción. Esta es una ABSOLUTE RESTRICTION del skill (capa S de CASTLE).

---

## Tabla de patologías — señales + acciones

| Patología | Señal de detección | Umbral | Acción | Severity | Capa CASTLE |
|-----------|--------------------|--------|--------|----------|-------------|
| `loop_detection` | Mismo `tool_name` con el mismo `input_hash` y `agent_id` repetido en una ventana corta | **> 5 veces en 2 min** | Veto + alerta `"Posible loop detectado — verificar condición de salida"` | `veto` | S/L |
| `runaway_agent` | Costo acumulado del agente vs estimado de los AC, sin progreso (`result_status: success` que avance el AC) | **cost > 3x estimado** sin progreso | Pausa + escalación al usuario | `escalation` | S |
| `role_drift` | El agente ejecuta `tool_name`/`feature` fuera de su scope declarado | Cualquier acción fuera de scope | Warning + log (`@security` evalúa) | `warning` | S |
| `cost_spike` | Costo de la sesión actual vs media histórica del mismo agente | **costo sesión > 2x media del agente** | Alerta FinOps | `warning` | L |

### Notas de detección

- **Loop detection** usa `input_hash` (emitido por `emit-span.sh` = hash de `tool+agent+phase+feature`). Dos llamadas con el mismo hash en < 2 min son indistinguibles desde el punto de vista del input → candidatas a loop. El Gherkin Scenario 1 usa 6 llamadas en 90s.
- **Runaway agent** requiere un baseline de estimación (de los AC del feature o del histórico). Sin baseline, no se declara (evita falso positivo) — ver IF FAILS de Phase 3.
- **Role drift**: el scope de cada agente se deriva de su definición (`agents/<agent>.md`, sección "Qué NO SOY responsable"). Ej.: `@ml-engineer` ejecutando código de aplicación no-ML = drift.
- **Cost spike** requiere histórico del agente (Engram `ai_audit` o ledgers de días previos). Sin histórico, no se declara.

---

## Formato de export CSV (`--export csv`)

Destino: `.king/audit/reports/<period>-cost-attribution.csv`. UTF-8 **sin BOM**, una fila de header, comas internas escapadas con comillas dobles. Importable en Excel/Google Sheets sin errores de formato (Gherkin Scenario 2).

### Columnas exactas (en orden)

```
agent_id,tool_name,tokens_estimated,cost_usd,phase,feature
```

### Ejemplo

```csv
agent_id,tool_name,tokens_estimated,cost_usd,phase,feature
ml-engineer,Bash,820,0.0066,build,auth
ml-engineer,Edit,1240,0.0099,build,auth
developer,Write,560,0.0045,build,auth
security,Read,300,0.0024,review,auth
```

### Reglas de formato CSV

- Header SIEMPRE en la primera fila — sin él Excel/Sheets no etiqueta columnas.
- `cost_usd` = `tokens_estimated` × precio del modelo (ver tabla de precios). Si no hay modelo: dejar el costo estimado directo del span.
- Valores con coma interna (raros en este schema) → envolver en comillas dobles `"a,b"`.
- UTF-8 **sin BOM**: un BOM al inicio rompe la primera columna en Excel (`ï»¿agent_id`).
- Una fila por `tool_span` filtrado por el período/`--agent`/`--phase`/`--feature` activos.

> El Gherkin Scenario 2 nombra el archivo `2026-05-cost-attribution.csv` para `--period 2026-05`. El patrón es `<period>-cost-attribution.csv`.

---

## Ejemplos de reportes `.md`

### `tokens-by-feature.md`

```markdown
# Tokens by Feature — 2026-05-28

| Feature | Tokens | % del total | Acciones |
|---------|--------|-------------|----------|
| auth | 2,620 | 62% | 3 |
| rag-search | 1,100 | 26% | 2 |
| (unknown) | 500 | 12% | 1 |

Total: 4,220 tokens en 6 acciones.
```

### `cost-attribution-by-agent.md`

```markdown
# Cost Attribution by Agent — 2026-05-28

| Agente | Tokens | Costo USD (est.) | Acciones | Cost spike |
|--------|--------|------------------|----------|------------|
| ml-engineer | 2,060 | $0.0165 | 2 | no |
| developer | 1,860 | $0.0149 | 3 | no |
| security | 300 | $0.0024 | 1 | no |

Total estimado: $0.0338. Validado por @ml-engineer.
```

### `veto-rate-by-phase.md`

```markdown
# Veto Rate by Phase — 2026-05-28

| Fase | Vetos | Total acciones | Veto-rate |
|------|-------|----------------|-----------|
| plan | 0 | 4 | 0% |
| build | 1 | 12 | 8.3% |
| qa | 0 | 5 | 0% |
| review | 2 | 7 | 28.6% |
```

### `pathology-report.md`

```markdown
# Pathology Report — 2026-05-28

## loop_detection (1)
- **ml-engineer** / build / auth — tool `Bash` 6x en 90s (input_hash 173e226db4e8cd24).
  Acción: VETO. Evidencia: 14:31:01 .. 14:32:09 (6 spans).

## runaway_agent (0)
Sin detecciones.

## role_drift (0)
Sin detecciones.

## cost_spike (0)
Sin detecciones (baseline: media histórica de ml-engineer = $0.012/sesión).
```

---

## Mapeo de flags del comando

| Flag | Efecto en el skill |
|------|--------------------|
| `--agent <id>` | Filtra el ledger por `agent_id` antes de los reportes (Phase 2) |
| `--phase <fase>` | Filtra por `phase` SDD (`plan`/`build`/`qa`/`review`) |
| `--feature <id>` | Filtra por `feature` |
| `--export csv` | Genera `<period>-cost-attribution.csv` (Phase 4). Aborta si el período está vacío |
| `--pathologies` | El `pathology-report.md` es el output principal; corre el scan de Phase 3 |
| `--period YYYY-MM` | Agrega todos los días del mes (default: día actual) |

---

## Cobertura de los escenarios Gherkin (M-13)

| Escenario | Artefacto / Gate / Fase |
|-----------|--------------------------|
| **Loop detection dispara alerta** (mismo tool 6 veces en 90s con mismo input hash → patología `loop_detection` + veto "Posible loop detectado — verificar condición de salida") | Phase 3 MUST DO 1 (loop detection >5 en 2 min, mismo `input_hash`) → evento `pathology` en `.king/audit/YYYY-MM-DD.jsonl` + evento `veto`. FINAL CHECKPOINT loop detection. |
| **Export para compliance genera CSV válido** (>= 100 entradas → `<period>-cost-attribution.csv` con columnas agent_id, tool_name, tokens_estimated, cost_usd, phase, feature, importable en Excel/Sheets) | Phase 4 MUST DO 5 (CSV UTF-8 sin BOM, 6 columnas exactas) + BLOCKING CONDITION (no CSV vacío). REQUIRED OUTPUT del export. |
| **Session summary forzado al cerrar sesión sin llamarlo** (hook Stop session-summary-force → fuerza `mem_session_summary` → sesión persistida en Engram con resumen de acciones y costos) | Hook `Stop session-summary-force` en `hooks/hooks.json` (busca flag `.king/audit/.session-summary-done`) + Phase N+1 MUST DO 3-4 (`mem_session_summary include_decisions:true include_costs:true` + tocar el flag). |

---

## Integración con otros skills

- **`/ai-cost-gate`** y **`/ai-observability`** ALIMENTAN el ledger: emiten eventos 429 (quota), open/close del breaker y spans OTel al mismo `.king/audit/YYYY-MM-DD.jsonl`. Este skill los CONSUME para los reportes.
- **`/cost-report`** (M-23) LEE el ledger producido por este skill para análisis de cost attribution profundo (trend mensual, cost per merged PR, predictive cost). Este skill es el productor; `/cost-report` el consumidor analítico.
- **`king-core/audit`** es ORTOGONAL: salud del framework, no acciones AI. No hay solapamiento de outputs.

---

## Variables de entorno que consume `emit-span.sh`

El hook lee estas env vars (provistas por el harness en `PostToolUse`); todas tienen default seguro:

| Env var | Default | Campo NDJSON |
|---------|---------|--------------|
| `AGENT_ID` | `unknown` | `agent_id` |
| `TOOL_NAME` | `unknown` | `tool_name` |
| `DURATION_MS` | `0` | `duration_ms` |
| `TOKEN_COST_ESTIMATED` | `0` | `tokens_estimated` |
| `RESULT_STATUS` | `unknown` | `result_status` |
| `SDD_PHASE` | `unknown` | `phase` |
| `FEATURE_ID` | `unknown` | `feature` |
| `SESSION_ID` | `unknown` | `session_id` |

> El hook construye `input_hash` = sha256(16 chars) de `tool_name|agent_id|phase|feature`. Es la base de loop detection: dos spans con el mismo hash en < 2 min son candidatos a loop.
