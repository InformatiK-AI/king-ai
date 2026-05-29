# cost-report — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/cost-report/SKILL.md`.
> Recordatorio: este skill es **READ-ONLY** sobre `.king/audit/*.jsonl`. Lee el ledger (`king.ai_audit.v1`), agrega y ESCRIBE solo en `.king/reports/cost/`. Formatos, schemas y algoritmos: `REFERENCE.md`.

---

## PHASE 1: Read Ledger

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] No se disparó ninguna BLOCKING CONDITION del `SKILL.md` (ledger no vacío para el período)

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Resolver el período**: `--period YYYY-MM` (mes completo) o `--from`/`--to`; default = día actual. Registrar `PERIOD`. Enumerar los archivos `.king/audit/YYYY-MM-DD.jsonl` que caen en el rango → `LEDGER_FILES`

2. [ ] **Parsear el NDJSON** línea a línea (READ-ONLY). Cada línea es un objeto `king.ai_audit.v1`. Leer los campos EXACTAMENTE como los define `skills/ai-audit-ledger/REFERENCE.md`:
   - Comunes: `ts`, `schema`, `event`, `agent_id`, `phase`, `feature`, `session_id`
   - `event: tool_span`: `tool_name`, `duration_ms`, `tokens_estimated`, `result_status`, `input_hash`
   - Ignorar líneas no parseables (NDJSON corrupto) con advertencia, NUNCA abortar por una línea mala

3. [ ] **Filtrar** por flags activos: `--agent <id>` → `agent_id`, `--feature <id>` → `feature`, `--phase <fase>` → `phase`. Registrar `SPANS` (la colección filtrada de eventos `tool_span`)

4. [ ] **Cargar precios por modelo** desde `knowledge/_inject/llm-integration-essentials.md` → `MODEL_PRICES` (USD por token, input/output). Definir la función `cost_usd(span) = tokens_estimated × precio`. Si no hay precio del modelo: usar el costo estimado directo y advertir (misma regla que el ledger CSV)

5. [ ] **Recuperar el historial de builds** desde Engram (`mem_search topic_key: ai_audit, tags: ['build']`) + los ledgers de días previos → `BUILD_HISTORY` (lista de builds con su costo total). Alimenta el baseline de Phase 3 (predictive). Registrar `BUILD_COUNT`

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] `PERIOD` y `LEDGER_FILES` resueltos; al menos un span leído
- [ ] `SPANS` poblado con los eventos `tool_span` del período (post-filtros)
- [ ] `MODEL_PRICES` cargado y `cost_usd()` definida
- [ ] `BUILD_HISTORY` y `BUILD_COUNT` registrados (aunque sean 0)

### OUTPUTS
- `PERIOD`, `LEDGER_FILES`, `SPANS`, `MODEL_PRICES`, `cost_usd()`, `BUILD_HISTORY`, `BUILD_COUNT` (en memoria de sesión)

### IF FAILS
```
No hay .king/audit/ ni *.jsonl para el período:
  → BLOCKING — "Sin eventos en el ledger para el período <X>. Ejecutar acciones AI o /ai-audit-ledger primero."
  → No generar reportes vacíos.

Líneas NDJSON corruptas / no parseables:
  → Saltar la línea con advertencia, contar las descartadas. NUNCA abortar por una línea mala.
  → Reportar el conteo de líneas descartadas en el .md final.

No hay precio para un modelo en llm-integration-essentials.md:
  → Usar el tokens_estimated como costo directo y advertir (mismo criterio que el CSV del ledger).
  → @ml-engineer valida en Phase 4 si el precio adoptado es correcto.

Engram no disponible (no se puede leer BUILD_HISTORY):
  → Degradar: reconstruir BUILD_HISTORY desde los ledgers crudos de días previos (NDJSON).
  → Advertir que el baseline puede ser parcial. NO abortar.
```

---

## PHASE 2: Aggregate (Top 5 + Trend + Cost per PR)

### GATE IN
- [ ] Phase 1 completada — `SPANS`, `cost_usd()` y `BUILD_HISTORY` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Algoritmos y formatos exactos en `REFERENCE.md`.

1. [ ] **Top 5 features por costo**: agrupar `SPANS` por `feature`, sumar `tokens_estimated` y `cost_usd`, contar acciones. Ordenar por `cost_usd` descendente y tomar el top 5. Calcular `% del total`. Registrar `TOP_FEATURES`

2. [ ] **Trend mensual por agente** (sparkline ASCII): agrupar `SPANS` por `agent_id` y, dentro de cada agente, por día (o mes si `--period` abarca varios meses). Para cada agente construir la serie temporal de `cost_usd` y renderizar un **sparkline ASCII de 8 niveles** (algoritmo en `REFERENCE.md`). Registrar `TREND_BY_AGENT`

3. [ ] **Cost per merged PR**: correlacionar los spans entre `/plan` y el merge de cada feature. Usar `session_id` + `feature` como clave de correlación (todos los spans de la misma feature desde el primer span en `phase=plan` hasta el span de merge en `phase=review`/GitFlow). Sumar `tokens_estimated` y `cost_usd` por PR. Registrar `COST_PER_PR`
   - Si no hay señal de merge en el ledger: usar el rango plan→último-span de la feature y marcar `(estimado, sin merge confirmado)`

4. [ ] **Total del período**: tokens totales, costo total, acciones totales. Registrar `PERIOD_TOTALS` (también se persiste como build histórico en Phase N+1)

### CHECKPOINT
> ✅ Verificar antes de Phase 3

- [ ] `TOP_FEATURES` tiene hasta 5 entradas ordenadas por costo, con `%` del total
- [ ] `TREND_BY_AGENT` tiene un sparkline ASCII por agente (8 niveles, normalizado)
- [ ] `COST_PER_PR` correlaciona spans plan→merge por `session_id`/`feature`
- [ ] `PERIOD_TOTALS` calculado (tokens, costo, acciones)

### OUTPUTS
- `TOP_FEATURES`, `TREND_BY_AGENT`, `COST_PER_PR`, `PERIOD_TOTALS` (en memoria de sesión)

### IF FAILS
```
Menos de 5 features distintos en el período:
  → Mostrar los que haya (1..4). NO inventar features. Titular "Top N features" con el N real.

Una serie temporal tiene un solo punto (no hay trend):
  → Renderizar el sparkline con ese único nivel y anotar "(serie de 1 punto, trend no significativo)".

No se puede correlacionar plan→merge (falta phase=plan o señal de merge):
  → Usar el rango disponible y marcar la entrada como "(estimado, sin merge confirmado)".
  → NUNCA omitir la sección; explicar la limitación.

Spans con feature=unknown:
  → Agruparlos bajo "(unknown)" como categoría propia, igual que hace el ledger.
  → No descartarlos: cuentan para el total y para anomalías.
```

---

## PHASE 3: Predictive Cost + Anomalies

### GATE IN
- [ ] Phase 2 completada — `PERIOD_TOTALS`, `TOP_FEATURES` y `BUILD_HISTORY` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Algoritmo de predictive cost y de anomalías en `REFERENCE.md`.

1. [ ] **Gate de historial para predictive**: verificar `BUILD_COUNT >= 5`.
   - Si `BUILD_COUNT < 5`: la sección Predictive Cost dice EXACTAMENTE `"Insuficiente historial (<BUILD_COUNT> builds) para predicción confiable — mínimo 5"` y NO muestra estimación. Saltar el resto del paso 2 (Gherkin Scenario 2)

2. [ ] **Calcular predictive cost** (solo si `BUILD_COUNT >= 5`):
   - `complexity_score = lines_changed_estimate × 0.3 + new_files_estimate × 0.5 + sdd_phase_count × 0.2`
   - `avg_tokens_per_complexity_unit` = media del `BUILD_HISTORY` (tokens totales / complexity_score por build)
   - `predicted_tokens = complexity_score × avg_tokens_per_complexity_unit`
   - `predicted_usd = predicted_tokens × model_price_per_token`
   - Registrar `PREDICTION` con el rango (± desviación del historial) y los inputs usados

3. [ ] **Detectar anomalías** (>3x el promedio de su categoría):
   - Para cada categoría (por `feature`, por `agent_id`, por `tool_name`) calcular el promedio de `cost_usd` por acción
   - Marcar como anomalía toda acción o agregado cuyo `cost_usd` > **3× el promedio de su categoría**
   - Cada anomalía cita: categoría, baseline (promedio), valor observado, factor (×), y la evidencia (`ts`/`agent_id`/`feature` del span). Registrar `ANOMALIES`
   - Si una categoría tiene < 2 muestras: NO declarar anomalía (sin baseline confiable → evita falso positivo)

### CHECKPOINT
> ✅ Verificar antes de Phase 4

- [ ] Gate de historial evaluado: predicción calculada SOLO si `BUILD_COUNT >= 5`; si no, mensaje de "Insuficiente historial" sin número
- [ ] `PREDICTION` registrada con inputs y rango (o ausente con la justificación)
- [ ] `ANOMALIES` registrada: cada una con categoría, baseline, factor y evidencia (o "Sin anomalías")
- [ ] Ninguna anomalía declarada sin baseline (categoría con < 2 muestras excluida)

### OUTPUTS
- `PREDICTION` (o mensaje de historial insuficiente), `ANOMALIES` (en memoria de sesión)

### IF FAILS
```
BUILD_COUNT < 5:
  → NO calcular predicción. Sección dice "Insuficiente historial (<N> builds) para predicción confiable — mínimo 5".
  → NUNCA inventar un número. Es el comportamiento correcto, no un fallo (Gherkin Scenario 2).

avg_tokens_per_complexity_unit no calculable (builds sin complexity_score):
  → Reconstruir complexity_score de cada build histórico desde sus spans (phases + features tocadas).
  → Si aún no es posible: degradar a "Insuficiente metadata de historial para predicción" sin número.

Categoría con < 2 muestras al detectar anomalías:
  → NO declarar anomalía (sin baseline confiable). Documentar que se omitió por falta de muestras.

predicted_usd resulta absurdo (ej: negativo o NaN):
  → No publicarlo. Revisar inputs (complexity_score, precios). Degradar a mensaje sin número y advertir.
```

---

## PHASE 4: Render + Export (md + finops.json + csv)

### GATE IN
- [ ] Phase 3 completada — `TOP_FEATURES`, `TREND_BY_AGENT`, `COST_PER_PR`, `PREDICTION`, `ANOMALIES` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Formato exacto de cada artefacto en `REFERENCE.md`.

1. [ ] **Crear directorio** `.king/reports/cost/` si no existe. NUNCA escribir en `.king/audit/` (READ-ONLY sobre el ledger)

2. [ ] **Renderizar el reporte `.md`** en `.king/reports/cost/YYYY-MM-DD-cost-report.md` con las 5 secciones EN ORDEN:
   1. Top 5 features por costo (`TOP_FEATURES`)
   2. Trend mensual por agente con sparkline ASCII (`TREND_BY_AGENT`)
   3. Cost per merged PR (`COST_PER_PR`)
   4. Predictive cost (`PREDICTION` o mensaje de historial insuficiente)
   5. Anomalías (`ANOMALIES` o "Sin anomalías")

3. [ ] **Generar el export FinOps** en `.king/reports/cost/YYYY-MM-DD-finops-export.json` (solo si `--export finops` o por default según el comando):
   - Una entrada por combinación `(feature, agent, phase)` agregada del período
   - Cada entrada con `provider`, `service`, `cost_center`, `tags: {feature, agent, phase}`, `usage: {tokens_in, tokens_out}`, `cost_usd`, `period`
   - Validar contra el FinOps Open Cost and Usage Spec (schema en `REFERENCE.md`)
   - Si el período está vacío: ⛔ abortar el export con `"No hay entradas para el período <X>"` (Gherkin Scenario 3)

4. [ ] **Generar el CSV** en `.king/reports/cost/YYYY-MM-DD-cost-report.csv`:
   - UTF-8 **sin BOM**, header obligatorio en la primera fila
   - Columnas (en orden): `feature,agent_id,phase,tokens_estimated,cost_usd,actions`
   - Comas internas escapadas con comillas dobles. Importable en Excel/Sheets sin errores

5. [ ] **Validar coherencia de totales**: la suma de `cost_usd` del CSV == suma del FinOps export == `PERIOD_TOTALS.cost_usd` (las tres vistas del mismo dato deben cuadrar)

6. [ ] **Entregar resumen a `@ml-engineer`**: período, total USD, top feature, anomalías detectadas, estado del predictive. Confirmar que ninguna línea del ledger fue modificada

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.md` escrito con las 5 secciones en orden
- [ ] `.king/reports/cost/YYYY-MM-DD-finops-export.json` escrito y válido contra el FinOps Open Cost and Usage Spec (o abortado si período vacío)
- [ ] `.king/reports/cost/YYYY-MM-DD-cost-report.csv` escrito (UTF-8 sin BOM, header, comas escapadas)
- [ ] Totales coherentes entre `.md`, `.json` y `.csv`
- [ ] `.king/audit/*.jsonl` NO modificado (skill READ-ONLY)
- [ ] Ningún artefacto contiene PII

### OUTPUTS
- `.king/reports/cost/YYYY-MM-DD-cost-report.md`
- `.king/reports/cost/YYYY-MM-DD-finops-export.json`
- `.king/reports/cost/YYYY-MM-DD-cost-report.csv`

### IF FAILS
```
.king/audit/ vacío al momento del export finops:
  → ⛔ abortar el export — "No hay entradas para el período <X>". No generar JSON vacío (Gherkin Scenario 3).
  → El .md igual puede generarse con las secciones que tengan datos.

El FinOps JSON no valida contra el spec (falta un campo obligatorio):
  → Corregir la entrada antes de escribir. Cada entrada DEBE tener provider, service, cost_center,
    tags, usage, cost_usd, period. NUNCA escribir un export inválido.

CSV abre roto en Excel (primera columna = ï»¿feature):
  → Hay un BOM. Reescribir el archivo en UTF-8 SIN BOM. El header debe leerse "feature".

Totales no cuadran entre .md, .json y .csv:
  → ⛔ DETENER. Es un bug de agregación. Revisar el filtrado y el cost_usd() antes de publicar.
  → Las tres vistas son el mismo dato: deben sumar igual.

mkdir .king/reports/cost/ falla (permisos):
  → Pedir al usuario crear el directorio manualmente y reintentar. NUNCA escribir fuera del project root.
```
