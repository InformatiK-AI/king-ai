# prompt-eval — REFERENCE

> 📚 Documentación de formatos, schemas y código de referencia. Esta sección NO contiene acciones.
> Fuente autoritativa de los conceptos: `knowledge/domain/llm-evals.md`.

---

## Estructura de artefactos generada

```
eval/
  golden-set/
    v1/
      cases.json            — los casos {id, input, expected_output, tags[]}
      metadata.json         — versión, fecha, locked_until, cobertura
  runners/
    golden-set-runner.ts    — exact_match + semantic_similarity
    llm-judge.ts            — LLM-as-judge con rúbrica (Haiku)
    regression-detector.ts  — compara vs baseline (last_green_ci)
    rag-metrics.ts          — (solo si HAS_RAG) faithfulness + answer_relevance
  reports/
    .gitkeep                — los reportes se generan en CI, NO se commitean
  eval.config.yaml          — thresholds, judge_model, baseline_strategy, weights
.github/
  workflows/
    prompt-eval.yml         — gate bloqueante en push:main + pull_request
```

Convención de golden set CANÓNICA: `eval/golden-set/v1/cases.json` (coherente con `llm-evals.md`).

---

## Formato `eval/golden-set/v1/cases.json`

```json
[
  {
    "id": "auth-001",
    "input": "¿Cómo reseteo mi contraseña si perdí acceso al email?",
    "expected_output": "Contactar a soporte vía el formulario de recuperación; verificación de identidad por DNI.",
    "tags": ["auth", "edge-case", "no-email-access"]
  },
  {
    "id": "billing-014",
    "input": "¿Me cobran si cancelo a mitad de ciclo?",
    "expected_output": "No hay reembolso prorrateado; el servicio sigue activo hasta fin de ciclo.",
    "tags": ["billing", "policy", "happy-path"]
  }
]
```

| Campo | Tipo | Propósito |
|-------|------|-----------|
| `id` | `string` | Identificador estable y legible (`dominio-NNN`). NUNCA reusar un id eliminado |
| `input` | `string` | El prompt/pregunta tal como llegaría en producción |
| `expected_output` | `string` | Respuesta de referencia. Para `semantic_similarity` y `llm_judge` no necesita ser literal |
| `tags` | `string[]` | Slicing de resultados: `happy-path`, `edge-case`, `adversarial`, dominio funcional |

**Mínimo de bootstrap**: ≥10 casos con cobertura `happy-path` + `edge-case`.

---

## Formato `eval/golden-set/v1/metadata.json`

```json
{
  "version": "v1",
  "created_at": "2026-05-28",
  "locked_until": "2026-11-28",
  "case_count": 12,
  "coverage": {
    "happy_path": 6,
    "edge_case": 4,
    "adversarial": 2
  },
  "notes": "Baseline inicial. Version lock: no modificar casos existentes; agregar solo en v2."
}
```

**Reglas de gobierno**: version lock (una versión publicada es inmutable — corregir = crear `v2`), rotación semestral (`locked_until` ≈ +6 meses), cobertura balanceada documentada en `coverage`.

---

## Formato `eval/eval.config.yaml` (completo)

```yaml
thresholds:
  golden_set_exact_match: 0.75
  golden_set_semantic_similarity: 0.85
  llm_judge_score: 0.80
  regression_max_drop: 0.05        # bloquea si el score baja más de 5% vs baseline
judge_model: claude-haiku-4-5      # económico — Haiku para evaluaciones masivas
baseline_strategy: last_green_ci   # compara vs último CI verde
weights:
  exact_match: 0.2
  semantic_similarity: 0.3
  llm_judge_score: 0.3
  faithfulness: 0.1                # solo activo si HAS_RAG
  answer_relevance: 0.1            # solo activo si HAS_RAG
```

- `judge_model` fijo en `claude-haiku-4-5`: costo ~10-20x menor que un modelo frontier, suficiente para rúbricas explícitas. El juez corre una vez por caso por cada run de CI.
- `baseline_strategy: last_green_ci`: el baseline es el score del último run de CI verde en la rama principal — evita comparar contra baselines obsoletos o rotos.
- `weights` combinan métricas en un score agregado; pondera más alto lo crítico del dominio (p.ej. `faithfulness` en asistentes legales/médicos).

---

## Rúbrica del LLM-as-judge

```
Eres un evaluador experto. Evalúa la RESPUESTA contra la REFERENCIA según estos
criterios. Devuelve SOLO JSON: {"score": 0.0-1.0, "reasoning": "..."}.

Criterios (peso):
- Correctitud factual (0.5): ¿la respuesta es factualmente consistente con la referencia?
- Completitud (0.3): ¿cubre los puntos clave de la referencia?
- Tono y formato (0.2): ¿es claro, directo y apropiado para el usuario?

Penaliza alucinaciones con score <= 0.3 sin importar otros criterios.

PREGUNTA: {input}
REFERENCIA: {expected_output}
RESPUESTA A EVALUAR: {actual_output}
```

| Decisión | Recomendación | Razón |
|----------|--------------|-------|
| Modelo juez | `claude-haiku-4-5` | Costo ~10-20x menor; suficiente para rúbricas explícitas |
| Output del juez | JSON `{score, reasoning}` | Parseable, auditable, no prosa libre |
| Temperatura | 0–0.2 | Maximiza consistencia entre corridas |
| Anti-sesgo | No revelar qué respuesta es del modelo bajo prueba | Evita self-enhancement bias |

> El `reasoning` del juez no es decorativo: es la evidencia cuando un caso falla en CI.

---

## `eval/runners/regression-detector.ts` (lógica de referencia)

```typescript
interface EvalResult {
  metric: string;
  score: number;
}

function detectRegression(
  current: EvalResult[],
  baseline: EvalResult[],
  maxDrop: number,            // p.ej. 0.05 desde eval.config.yaml
): { regressed: boolean; offenders: string[] } {
  const baselineMap = new Map(baseline.map((r) => [r.metric, r.score]));
  const offenders: string[] = [];

  for (const { metric, score } of current) {
    const prev = baselineMap.get(metric);
    if (prev === undefined) continue;        // métrica nueva, sin baseline aún → NO bloquea
    if (prev - score > maxDrop) {            // cayó más que la tolerancia
      offenders.push(
        `regression detected: ${metric} ${prev.toFixed(2)}→${score.toFixed(2)} ` +
        `(drop ${(prev - score).toFixed(2)} > max_drop ${maxDrop})`,
      );
    }
  }

  return { regressed: offenders.length > 0, offenders };
}

// En CI: si regressed === true → process.exit(1) (bloquea el merge)
```

> Una métrica NUEVA sin baseline (`prev === undefined`) NO bloquea: todavía no hay con qué comparar. Su primer valor verde *se convierte* en baseline para la próxima corrida.

El baseline se obtiene según `baseline_strategy: last_green_ci` (descargar el reporte del último run de CI verde en `main`, p.ej. vía artifact de GitHub Actions o `eval/reports/baseline.json` recuperado del run).

---

## `eval/runners/golden-set-runner.ts` (esqueleto de referencia)

```typescript
// Lee cases.json + eval.config.yaml, ejecuta el sistema bajo prueba por caso,
// calcula exact_match (binario) y semantic_similarity (cosine de embeddings),
// agrega por métrica y compara contra thresholds.
//
// exit != 0 si: golden_set_exact_match < threshold || semantic_similarity < threshold.
// Escribe el reporte en eval/reports/ (NO commiteado).
```

| Métrica | Qué mide | Rango | Costo |
|---------|----------|-------|-------|
| `exact_match` | Coincidencia literal con `expected_output` | {0, 1} | Nulo |
| `semantic_similarity` | Cercanía de significado (embeddings, cosine) | [0, 1] | Bajo |
| `llm_judge_score` | Calidad cualitativa contra rúbrica | [0, 1] | Alto |
| `faithfulness` (RAG) | ¿La respuesta se apoya SOLO en el contexto recuperado? | [0, 1] | Alto |
| `answer_relevance` (RAG) | ¿La respuesta realmente responde la pregunta? | [0, 1] | Medio |

> Regla de oro: mide lo barato primero (`exact_match`), escala a lo caro (`llm_judge`) solo cuando lo barato no discrimina.

---

## `.github/workflows/prompt-eval.yml` (plantilla)

```yaml
# .github/workflows/prompt-eval.yml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Run golden set
        run: npm run eval:golden-set        # exact_match + semantic_similarity
      - name: Run LLM-as-judge
        run: npm run eval:judge              # llm_judge_score (haiku)
      - name: Regression gate
        run: npm run eval:regression         # falla si drop > regression_max_drop
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}
    # Cualquier step que retorne exit != 0 bloquea el merge.
```

### Comportamiento del gate (bloqueante por diseño)

| Condición | Resultado |
|-----------|-----------|
| Toda métrica ≥ su threshold Y `drop ≤ max_drop` | PASA — el verde se vuelve el nuevo baseline |
| Alguna métrica < su threshold | FALLA — `score < threshold` bloquea |
| Caída > `max_drop` vs `last_green_ci` | FALLA — regresión detectada, bloquea |
| Métrica nueva sin baseline | NO bloquea por regresión; su valor se registra como baseline inicial |

> Los reportes se generan en CI, NO se commitean (`eval/reports/.gitkeep`). Mantener reportes en el repo genera ruido de diffs.

---

## Scripts `package.json`

```json
{
  "scripts": {
    "eval": "npm run eval:golden-set && npm run eval:judge && npm run eval:regression",
    "eval:golden-set": "tsx eval/runners/golden-set-runner.ts",
    "eval:judge": "tsx eval/runners/llm-judge.ts",
    "eval:regression": "tsx eval/runners/regression-detector.ts"
  }
}
```

> El runner exacto (`tsx`, `ts-node`, build previo) depende del stack del proyecto. Lo relevante es que cada script retorne `exit != 0` ante fallo.

---

## Extensión RAG (Ragas-style)

Si el proyecto tiene RAG (`/rag-setup` detectado en Phase 1), el harness se **extiende**, no se reemplaza:

- Los casos del golden set incorporan el contexto recuperado (chunks) además de `input`/`expected_output`.
- Se genera `eval/runners/rag-metrics.ts` que calcula:
  - **`faithfulness`** — ¿la respuesta se apoya SOLO en el contexto recuperado? (defensa principal anti-alucinación en RAG; penaliza afirmaciones que no derivan del contexto, aunque sean ciertas).
  - **`answer_relevance`** — ¿la respuesta realmente responde la pregunta? (detecta respuestas correctas y fundamentadas que NO responden lo preguntado).
- Sus thresholds y `weights` se agregan a `eval.config.yaml`.

Criterio de framework (de `llm-evals.md`): stack TypeScript + métricas simples → custom runner. Con RAG y necesidad de métricas de recuperación → añadir métricas estilo Ragas al custom runner; para debug profundo del pipeline (chunking/retrieval/re-ranking) → considerar TruLens.

---

## Anti-patrones (de `llm-evals.md`)

| Anti-patrón | Síntoma | Solución |
|-------------|---------|----------|
| Golden set solo happy-path | Evals verdes pero quejas en prod | Agregar `edge-case` + `adversarial` con cobertura en `metadata.json` |
| Editar casos existentes | Baselines incomparables | Version lock: crear `v2`, nunca mutar `v1` |
| Juez = modelo bajo prueba sin rúbrica | Scores inflados (self-preference) | Juez distinto o rúbrica estricta + output JSON |
| Threshold gate no bloqueante | Evals que nadie mira | `exit != 0` en CI ante fallo de threshold o regresión |
| Solo métricas duras en texto libre | `exact_match` siempre bajo, ruidoso | Combinar con `semantic_similarity` + `llm_judge` |
| Modelo frontier como juez | Costo de CI desproporcionado | `judge_model: claude-haiku-4-5` |
| Comparar contra baseline arbitrario | Regresiones intermitentes/falsas | `baseline_strategy: last_green_ci` |

---

## Integración con otros skills

- **`/rag-setup`** — extiende el harness con `faithfulness` + `answer_relevance` (ver Extensión RAG).
- **`/ai-cost-gate`** — controla el costo del juez Haiku en CI.
- **`/build`** — implementar/iterar prompts sobre el harness recién creado; el CI gate valida cada PR.
