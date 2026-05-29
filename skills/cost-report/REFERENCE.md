# cost-report — REFERENCE

> 📚 Documentación. Esta sección NO contiene acciones — formato de cada sección del reporte, FinOps export JSON schema, algoritmo de sparkline ASCII, algoritmo de predictive cost, detección de anomalías, formato CSV, ejemplos y cobertura Gherkin.
> Schema del ledger que se CONSUME: `skills/ai-audit-ledger/REFERENCE.md` (`king.ai_audit.v1`). Precios por modelo: `knowledge/_inject/llm-integration-essentials.md`. Pattern Engram + histórico de builds: `knowledge/domain/engram-integration.md` §4 y §8.

---

## ADR-01: `/cost-report` es CONSUMIDOR, `/ai-audit-ledger` es PRODUCTOR

El AI Audit Ledger (`.king/audit/YYYY-MM-DD.jsonl`) es escrito por `emit-span.sh` (hook `PostToolUse`) y enriquecido por `/ai-audit-ledger` (eventos `pathology`, `veto`, `correction`). `/ai-observability` y `/ai-cost-gate` también lo alimentan (spans OTel, eventos 429/breaker). `/cost-report` **solo lee**. Esta separación productor/consumidor mantiene el ledger como fuente de verdad inmutable: si el reporte tuviera permiso de escritura sobre el ledger, la cadena de auditoría dejaría de ser confiable para compliance. Por eso `/cost-report` escribe en un directorio distinto (`.king/reports/cost/`), nunca en `.king/audit/`.

## ADR-02: Coherencia de schema obligatoria

`/cost-report` lee los campos EXACTAMENTE como los define el productor en `skills/ai-audit-ledger/REFERENCE.md`: `ts`, `schema: king.ai_audit.v1`, `event`, `agent_id`, `phase`, `feature`, `session_id` y, para `tool_span`, `tool_name`, `duration_ms`, `tokens_estimated`, `result_status`, `input_hash`. Cualquier campo inventado o renombrado rompe la coherencia. Si el productor sube de `v1` a `v2`, este consumidor DEBE actualizarse en lockstep. El `cost_usd` NO está en el ledger: se DERIVA de `tokens_estimated × precio del modelo` (mismo criterio que el CSV del ledger).

## ADR-03: Predictive cost necesita baseline — sin él, no hay número

Una predicción sin historial suficiente es ruido disfrazado de dato. El umbral es **>= 5 builds históricos**. Con menos, el reporte dice `"Insuficiente historial (<N> builds) para predicción confiable — mínimo 5"` y omite la estimación. Esto es deliberado: el founder prefiere "no sé todavía" a un número inventado sobre el que tomaría decisiones de presupuesto. El baseline (`avg_tokens_per_complexity_unit`) se recalcula de `BUILD_HISTORY` en cada ejecución, así la predicción mejora conforme se acumulan builds.

## ADR-04: Anomalía relativa a la categoría, no absoluta

El umbral de anomalía es **>3x el promedio de su categoría**, no un valor absoluto en USD. Un build de `auth` que cuesta $0.40 puede ser normal mientras un span de `Read` que cuesta $0.40 es claramente anómalo. La comparación SIEMPRE es contra el promedio de la misma categoría (`feature`, `agent_id` o `tool_name`). Una categoría con < 2 muestras NO produce anomalía: sin baseline, declarar anomalía es un falso positivo garantizado.

---

## Schema JSONL consumido (`king.ai_audit.v1`)

Solo los campos que `/cost-report` lee. Definición completa y autoritativa: `skills/ai-audit-ledger/REFERENCE.md`.

| Campo | Tipo | Uso en `/cost-report` |
|-------|------|-----------------------|
| `ts` | string ISO-8601 UTC | Bucketing temporal del trend; evidencia de anomalías |
| `event` | string | Solo se agregan eventos `tool_span` para costo (los `pathology`/`veto` se cuentan aparte si se necesitan) |
| `agent_id` | string | Trend mensual por agente; categoría de anomalía; FinOps tag `agent` |
| `phase` | string | Cost per merged PR (plan→merge); FinOps tag `phase` |
| `feature` | string | Top 5 features; categoría de anomalía; FinOps tag `feature` |
| `session_id` | string | Correlación plan→merge para cost per PR |
| `tokens_estimated` | number | Base de todo costo: `cost_usd = tokens_estimated × precio` |
| `result_status` | string | Distinguir acciones exitosas de errores en la atribución |
| `input_hash` | string | (opcional) desambiguar acciones repetidas al correlacionar |

Línea de ejemplo (idéntica al productor):

```json
{"ts":"2026-05-28T14:30:01Z","schema":"king.ai_audit.v1","event":"tool_span","agent_id":"ml-engineer","tool_name":"Bash","duration_ms":1234,"tokens_estimated":820,"result_status":"success","phase":"build","feature":"auth","session_id":"sess-001","input_hash":"173e226db4e8cd24"}
```

> El `cost_usd` se calcula en el consumidor. Si `llm-integration-essentials.md` no tiene el precio del modelo del span, se usa `tokens_estimated` como costo directo y se advierte (mismo criterio que el CSV del ledger).

---

## Formato de cada sección del reporte `.md`

Archivo: `.king/reports/cost/YYYY-MM-DD-cost-report.md`. Las 5 secciones van EN ORDEN.

### Encabezado

```markdown
# AI Cost Report — 2026-05 (período: 2026-05-01 .. 2026-05-31)

Generado: 2026-05-28T15:00:00Z · Fuente: .king/audit/*.jsonl (READ-ONLY)
Total del período: 124,300 tokens · $0.9870 estimado · 312 acciones · 6 agentes
```

### Sección 1 — Top 5 features por costo

```markdown
## 1. Top 5 features por costo

| # | Feature | Tokens | Costo USD (est.) | % del total | Acciones |
|---|---------|--------|------------------|-------------|----------|
| 1 | auth | 52,400 | $0.4192 | 42.5% | 130 |
| 2 | rag-search | 31,100 | $0.2488 | 25.2% | 78 |
| 3 | billing | 18,900 | $0.1512 | 15.3% | 44 |
| 4 | dashboard | 12,400 | $0.0992 | 10.1% | 38 |
| 5 | (unknown) | 9,500 | $0.0760 | 7.7% | 22 |
```

> Si hay menos de 5 features, titular "Top N features" con el N real. `feature=unknown` es una categoría propia, no se descarta.

### Sección 2 — Trend mensual por agente (sparkline ASCII)

```markdown
## 2. Trend mensual por agente

Costo USD por día. Sparkline normalizado a 8 niveles (▁▂▃▄▅▆▇█), min..max de cada serie.

| Agente | Trend | Min | Max | Total USD |
|--------|-------|-----|-----|-----------|
| ml-engineer | ▁▂▄▃▆█▅▂ | $0.001 | $0.089 | $0.412 |
| developer | ▂▃▃▅▇█▆▄ | $0.002 | $0.071 | $0.331 |
| security | ▁▁▂▁▃▂▁▁ | $0.000 | $0.012 | $0.038 |
```

### Sección 3 — Cost per merged PR

```markdown
## 3. Cost per merged PR

Tokens consumidos entre el primer span en `phase=plan` y el merge (correlación por session_id + feature).

| PR / Feature | Tokens (plan→merge) | Costo USD (est.) | Acciones | Estado |
|--------------|---------------------|------------------|----------|--------|
| auth | 48,200 | $0.3856 | 118 | merged |
| rag-search | 29,800 | $0.2384 | 71 | merged |
| billing | 17,100 | $0.1368 | 40 | (estimado, sin merge confirmado) |
```

### Sección 4 — Predictive cost

Con historial suficiente (`>= 5 builds`):

```markdown
## 4. Predictive cost (próximo /build)

Basado en 8 builds históricos. avg_tokens_per_complexity_unit = 1,240.

| Input | Valor |
|-------|-------|
| lines_changed_estimate | 320 |
| new_files_estimate | 6 |
| sdd_phase_count | 4 |
| complexity_score | 320·0.3 + 6·0.5 + 4·0.2 = 99.8 |
| predicted_tokens | 99.8 × 1,240 ≈ 123,752 |
| predicted_usd | ≈ $0.99 (rango $0.81 .. $1.17, ±desv. del historial) |
```

Sin historial suficiente (`< 5 builds`) — Gherkin Scenario 2:

```markdown
## 4. Predictive cost (próximo /build)

Insuficiente historial (3 builds) para predicción confiable — mínimo 5.
```

### Sección 5 — Anomalías

```markdown
## 5. Anomalías (>3x el promedio de su categoría)

| Categoría | Entidad | Baseline (prom.) | Observado | Factor | Evidencia |
|-----------|---------|------------------|-----------|--------|-----------|
| tool_name | Bash | $0.0021 | $0.0089 | 4.2x | 2026-05-21T10:14:03Z · ml-engineer · auth |
| feature | billing | $0.0512 | $0.1840 | 3.6x | agregado del 2026-05-19 · developer |

(Categorías con < 2 muestras se excluyen — sin baseline confiable.)
```

Si no hay:

```markdown
## 5. Anomalías (>3x el promedio de su categoría)

Sin anomalías. (Baselines: ver totales por categoría arriba.)
```

---

## FinOps export JSON schema

Archivo: `.king/reports/cost/YYYY-MM-DD-finops-export.json`. Compatible con Vantage / Cloudability y el **FinOps Open Cost and Usage Specification (FOCUS)**. Es un array de entradas; una entrada por combinación agregada `(feature, agent, phase)` del período.

### Campos por entrada

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `provider` | string | Sí | Proveedor del modelo: `anthropic`, `openai`, ... (de `llm-integration-essentials.md`) |
| `service` | string | Sí | Servicio: `claude`, `gpt`, ... |
| `cost_center` | string | Sí | Centro de costo: `engineering` por default; configurable |
| `tags` | object | Sí | `{ feature, agent, phase }` — los tres tags del ledger (`agent_id`, `phase`, `feature`) |
| `usage` | object | Sí | `{ tokens_in, tokens_out }` — uso agregado de la entrada |
| `cost_usd` | number | Sí | Costo estimado de la entrada (`tokens × precio del modelo`) |
| `period` | string | Sí | Período de la entrada: `YYYY-MM` (mes) o `YYYY-MM-DD` (día) |

### Ejemplo (válido contra el spec)

```json
[
  {
    "provider": "anthropic",
    "service": "claude",
    "cost_center": "engineering",
    "tags": { "feature": "auth", "agent": "ml-engineer", "phase": "build" },
    "usage": { "tokens_in": 45000, "tokens_out": 12000 },
    "cost_usd": 0.34,
    "period": "2026-05"
  },
  {
    "provider": "anthropic",
    "service": "claude",
    "cost_center": "engineering",
    "tags": { "feature": "rag-search", "agent": "developer", "phase": "build" },
    "usage": { "tokens_in": 22000, "tokens_out": 7100 },
    "cost_usd": 0.19,
    "period": "2026-05"
  }
]
```

### Reglas del export

- Cada entrada DEBE tener los 7 campos obligatorios. Una entrada sin `cost_center` o sin `tags` es inválida y NO se escribe.
- `tags` mapea 1:1 a los tres tags del ledger: `feature` ← `feature`, `agent` ← `agent_id`, `phase` ← `phase`.
- Si el ledger no separa `tokens_in`/`tokens_out` (solo trae `tokens_estimated`), repartir según el ratio input/output del modelo en `llm-integration-essentials.md`, o poner `tokens_in: tokens_estimated, tokens_out: 0` y documentarlo.
- Período vacío → NO escribir un array vacío silencioso: abortar el export con `"No hay entradas para el período <X>"` (Gherkin Scenario 3).
- Sin PII: NUNCA un `user_id`, `prompt_text` ni `user_ip` entre los tags o el usage.

---

## Algoritmo de sparkline ASCII

Convierte una serie numérica de costos (uno por bucket temporal) en una línea de bloques Unicode de 8 niveles. Determinista, sin dependencias.

### Caracteres (8 niveles, de menor a mayor)

```
▁ ▂ ▃ ▄ ▅ ▆ ▇ █
```

### Algoritmo (pseudocódigo)

```
function sparkline(series):           # series = [cost_bucket_0, cost_bucket_1, ...]
    blocks = ["▁","▂","▃","▄","▅","▆","▇","█"]
    if series.isEmpty: return ""
    lo = min(series)
    hi = max(series)
    span = hi - lo
    out = ""
    for v in series:
        if span == 0:                 # serie plana → nivel medio
            idx = 0
        else:
            idx = round((v - lo) / span * (len(blocks) - 1))   # 0..7
        out += blocks[idx]
    return out
```

### Notas

- Normalización **por serie** (cada agente tiene su propio min/max), por eso la columna del reporte muestra `Min`/`Max` reales: el sparkline da la forma, las columnas dan la magnitud absoluta.
- `span == 0` (un solo punto o serie constante) → todos los bloques al nivel más bajo, con la anotación `(serie de 1 punto, trend no significativo)`.
- Buckets: por día si `--period` es un mes; por mes si abarca varios meses.
- Es ASCII-extendido (bloques Unicode); se renderiza en cualquier terminal y en Markdown.

---

## Algoritmo de predictive cost

Estima el costo del próximo `/build` a partir de un complexity score y el historial. **Solo se calcula con `>= 5 builds` históricos.**

### Fórmula (de la fuente M-23)

```
complexity_score = lines_changed_estimate * 0.3
                 + new_files_estimate     * 0.5
                 + sdd_phase_count        * 0.2

avg_tokens_per_complexity_unit = mean( build.total_tokens / build.complexity_score
                                       for build in BUILD_HISTORY )

predicted_tokens = complexity_score * avg_tokens_per_complexity_unit
predicted_usd    = predicted_tokens * model_price_per_token
```

### Inputs

| Input | Origen |
|-------|--------|
| `lines_changed_estimate` | Estimación del SDD proposal / diff esperado del próximo build |
| `new_files_estimate` | Archivos nuevos estimados del proposal |
| `sdd_phase_count` | Nº de fases SDD del proposal (plan/build/qa/review = 4) |
| `BUILD_HISTORY` | Builds previos (Engram `topic_key: ai_audit, tags: ['build']` + ledgers de días previos) con `total_tokens` y `complexity_score` |
| `model_price_per_token` | `knowledge/_inject/llm-integration-essentials.md` (modelo primario del proyecto) |

### Gate de confianza

```
if BUILD_COUNT < 5:
    return "Insuficiente historial (" + BUILD_COUNT + " builds) para predicción confiable — mínimo 5"
```

- El rango (`predicted_usd ± desviación`) se deriva de la desviación estándar de `total_tokens / complexity_score` en el historial: más varianza histórica → rango más ancho.
- Si los builds históricos no tienen `complexity_score` registrado, se reconstruye desde sus spans (phases y features tocadas). Si aún no es posible, degradar a "Insuficiente metadata de historial" sin número.

---

## Detección de anomalías

| Concepto | Definición |
|----------|------------|
| Categoría | `feature`, `agent_id` o `tool_name` |
| Baseline | Promedio de `cost_usd` por acción dentro de la categoría |
| Umbral | `cost_usd_observado > 3 × baseline_de_la_categoría` |
| Muestras mínimas | La categoría necesita `>= 2` muestras; con menos no se declara anomalía |
| Evidencia | `ts` + `agent_id` + `feature` del span (o "agregado del <fecha>") |

```
for category in [by_feature, by_agent, by_tool]:
    for group in category.groups:
        if group.sample_count < 2: continue          # sin baseline confiable
        baseline = mean(cost_usd(action) for action in group)
        for action in group:
            if cost_usd(action) > 3 * baseline:
                anomalies.add(category, action, baseline, factor = cost_usd(action)/baseline)
```

---

## Formato CSV (`YYYY-MM-DD-cost-report.csv`)

UTF-8 **sin BOM**, una fila de header, comas internas escapadas con comillas dobles. Importable en Excel/Google Sheets sin errores.

### Columnas exactas (en orden)

```
feature,agent_id,phase,tokens_estimated,cost_usd,actions
```

### Ejemplo

```csv
feature,agent_id,phase,tokens_estimated,cost_usd,actions
auth,ml-engineer,build,38200,0.3056,92
auth,developer,build,14200,0.1136,38
rag-search,developer,build,29800,0.2384,71
billing,security,review,5100,0.0408,12
(unknown),ml-engineer,unknown,9500,0.0760,22
```

### Reglas de formato CSV

- Header SIEMPRE en la primera fila — sin él Excel/Sheets no etiqueta columnas.
- Una fila por combinación agregada `(feature, agent_id, phase)` del período (post-filtros).
- `cost_usd` = `tokens_estimated × precio del modelo`. Sin precio → costo estimado directo + advertencia.
- UTF-8 **sin BOM**: un BOM rompe la primera columna en Excel (`ï»¿feature`).
- Valores con coma interna → envolver en comillas dobles (`"a,b"`).
- La suma de `cost_usd` del CSV DEBE cuadrar con el FinOps export y con el total del `.md`.

---

## Mapeo de flags del comando

| Flag | Efecto en el skill |
|------|--------------------|
| `--period YYYY-MM` | Agrega todos los días del mes (default: día actual) |
| `--from <fecha> --to <fecha>` | Rango explícito de fechas |
| `--agent <id>` | Filtra el ledger por `agent_id` antes de agregar |
| `--phase <fase>` | Filtra por `phase` SDD (`plan`/`build`/`qa`/`review`) |
| `--feature <id>` | Filtra por `feature` |
| `--predict` | Fuerza el cálculo de la sección Predictive Cost (sujeto al gate de >= 5 builds) |
| `--export finops` | Genera el `finops-export.json` (aborta si el período está vacío) |
| `--cost-center <nombre>` | Sobrescribe el `cost_center` del export FinOps (default `engineering`) |

---

## Cobertura de los escenarios Gherkin (M-23)

| Escenario | Artefacto / Gate / Fase |
|-----------|--------------------------|
| **Reporte muestra top features por costo** (ledger con 30 días y 5+ features → top 5 features por costo total en USD + trend mensual con sparkline ASCII por agente + cost per merged PR del mes) | Phase 2 MUST DO 1-3 (`TOP_FEATURES`, `TREND_BY_AGENT` sparkline 8 niveles, `COST_PER_PR`) → Secciones 1-3 del `.md`. REQUIRED OUTPUTS (Top 5, Trend, Cost per PR). |
| **Predictive cost solo cuando hay historial suficiente** (`< 5 builds` → `"Insuficiente historial (3 builds) para predicción confiable — mínimo 5"`, sin estimación) | Phase 3 MUST DO 1 (gate `BUILD_COUNT >= 5`) + BLOCKING CONDITION 3 + ABSOLUTE RESTRICTION ("NUNCA emitir predicción con < 5 builds"). Sección 4 del `.md`. |
| **Export FinOps genera JSON compatible con Vantage** (`--export finops --period 2026-05` → `.king/reports/cost/2026-05-finops-export.json`, cada entrada con `provider`, `service`, `cost_center`, `tags`, `usage`, `cost_usd`, válido contra FinOps Open Cost and Usage Spec) | Phase 4 MUST DO 3 (export FinOps + validación de schema) + BLOCKING CONDITION 2 (no JSON vacío) + REQUIRED OUTPUT (`finops-export.json`). FinOps export JSON schema arriba. |

---

## Integración con otros skills

- **`/ai-audit-ledger`** (M-13) es el **PRODUCTOR**: escribe `.king/audit/YYYY-MM-DD.jsonl` y los reportes de patología en `.king/audit/reports/`. `/cost-report` es el **CONSUMIDOR analítico**: lee ese ledger y produce el análisis de costo agregado en `.king/reports/cost/`. Mismo schema (`king.ai_audit.v1`), coherencia obligatoria.
- **`/ai-cost-gate`** (M-87) y **`/ai-observability`** ALIMENTAN el ledger (eventos 429/breaker, spans OTel). `/cost-report` los ve reflejados en el costo agregado. Tras detectar anomalías o features caras, `/cost-report` recomienda `/ai-cost-gate` para imponer budget/breaker.
- **GitFlow / `/pr` / `/merge`**: el `cost per merged PR` correlaciona los spans entre `phase=plan` y el merge. La señal de merge proviene del ledger (span en `phase=review`) o del estado GitFlow del proyecto.
- **Engram** (`topic_key: ai_audit`): el histórico de builds que alimenta el predictive cost vive aquí. Cada ejecución de `/cost-report` persiste el costo del período como build histórico (Phase N+1), mejorando el baseline de futuras predicciones.
