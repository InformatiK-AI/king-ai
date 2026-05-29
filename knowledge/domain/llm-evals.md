# LLM Evals Knowledge Base

## Overview

Guía práctica para diseñar suites de evaluación (evals) de sistemas basados en LLM. Cubre la elección de framework, construcción y gobierno de golden sets, el patrón LLM-as-judge, detección de regresiones contra baseline y la integración con CI mediante threshold gates bloqueantes.

Una eval NO es un test unitario clásico: la salida de un LLM es no determinista y la noción de "correcto" suele ser un espectro, no un booleano. Por eso una suite de evals combina:

- **Métricas determinísticas** (`exact_match`) — baratas, rápidas, cero ambigüedad cuando aplican.
- **Métricas semánticas** (`semantic_similarity`) — toleran parafraseo manteniendo objetividad.
- **Juicio cualitativo** (`llm_judge_score`) — captura matices que ninguna métrica numérica alcanza, a costa de latencia y dinero.
- **Métricas de RAG** (`faithfulness`, `answer_relevance`) — específicas para pipelines con recuperación de contexto.

Regla de oro: **mide lo barato primero, escala a lo caro solo cuando lo barato no discrimina.** Si `exact_match` ya separa buenos de malos en un caso, no gastes un `llm_judge` en él.

---

## Frameworks de Evaluación

No existe un framework universal. La elección depende de si tienes RAG, de tu stack (Python vs TypeScript) y de cuánto control necesitas sobre las métricas.

| Framework | Fortaleza principal | Stack | Cuándo elegirlo |
|-----------|--------------------|-------|-----------------|
| **Ragas** | Métricas RAG out-of-the-box (`faithfulness`, `answer_relevance`, `context_precision`, `context_recall`) | Python | El proyecto tiene RAG y necesitas medir calidad de recuperación + generación juntas |
| **TruLens** | Observabilidad + feedback functions con tracing de cada paso del pipeline | Python | Necesitas instrumentar y depurar *por qué* falla una respuesta, no solo *si* falla |
| **Custom runner** | Control total sobre métricas, formato y gates; sin dependencias pesadas | TS / Python | Stack TypeScript, evals simples (golden set + judge), o quieres versionar la lógica de scoring junto al código |

### Criterio de decisión

```
¿Tiene RAG el proyecto?
├── SÍ → ¿Necesitas debug profundo del pipeline (chunking, retrieval, re-ranking)?
│        ├── SÍ  → TruLens (tracing + feedback functions)
│        └── NO  → Ragas (métricas RAG directas, menos boilerplate)
└── NO → ¿Stack TypeScript o métricas simples (match + judge)?
         ├── SÍ  → Custom runner (golden-set-runner.ts + llm-judge.ts)
         └── NO  → Ragas en modo no-RAG (sigue dando answer_relevance, similarity)
```

> En el harness de `/prompt-eval` el default es **custom runner** en TypeScript (golden set + LLM-as-judge + regression detector). Si `/rag-setup` detecta RAG, el harness se **extiende** con métricas estilo Ragas (`faithfulness`, `answer_relevance`) — no se reemplaza.

---

## Golden Sets

El golden set es el contrato de calidad versionado de tu sistema. Es el activo más valioso de la suite: un modelo cambia, el golden set permanece.

### Formato `cases.json`

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
| `input` | `string` | El prompt o pregunta tal como llegaría en producción |
| `expected_output` | `string` | Respuesta de referencia. Para `semantic_similarity` y `llm_judge` no necesita ser literal, sino representar la intención correcta |
| `tags` | `string[]` | Clasificación para slicing de resultados: `happy-path`, `edge-case`, `adversarial`, dominio funcional |

### Estructura de carpetas y version lock

```
eval/golden-set/
  v1/
    cases.json       — los casos
    metadata.json    — versión, fecha de creación, cobertura de edge cases
  v2/
    cases.json
    metadata.json
```

`metadata.json`:

```json
{
  "version": "v1",
  "created_at": "2026-05-28",
  "locked_until": "2026-11-28",
  "case_count": 64,
  "coverage": {
    "happy_path": 30,
    "edge_case": 24,
    "adversarial": 10
  },
  "notes": "Baseline inicial. No modificar casos existentes; agregar solo en v2."
}
```

### Reglas de gobierno

- **Version lock**: una vez publicada, una versión del golden set es **inmutable**. Corregir un caso significa crear `v2`, no editar `v1`. Esto garantiza que las comparaciones de regresión sean válidas (mismo conjunto de casos = mismo metro).
- **Rotación semestral**: cada ~6 meses se revisa el golden set para incorporar casos reales de producción, retirar casos obsoletos y rebalancear cobertura. La rotación produce una nueva versión y un nuevo baseline.
- **Cobertura balanceada**: como mínimo `happy-path` + `edge-case`; idealmente también `adversarial`. Un golden set de solo happy paths da una falsa sensación de seguridad.
- **El golden set vive en git**; los **reportes NO** (se generan en CI). Solo `cases.json` y `metadata.json` se commitean.

---

## LLM-as-Judge

Cuando `exact_match` y `semantic_similarity` no bastan (respuestas largas, razonamiento, tono), un segundo LLM evalúa la respuesta contra una rúbrica. Es el patrón más potente y el más caro: úsalo con criterio.

### Rúbrica

La rúbrica convierte "buena respuesta" en algo medible. Debe ser explícita, acotada y devolver un score normalizado.

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

### Modelo del juez: Haiku por costo

```yaml
judge_model: claude-haiku-4-5   # económico — haiku para evaluaciones masivas
```

El juez se ejecuta **una vez por caso, en cada corrida de CI**. Con un golden set de 64 casos eso son 64 llamadas por PR. Usar un modelo frontier como juez multiplica el costo sin mejorar significativamente la discriminación en rúbricas bien definidas.

| Decisión | Recomendación | Razón |
|----------|--------------|-------|
| Modelo juez | `claude-haiku-4-5` | Costo ~10-20x menor; suficiente para rúbricas explícitas |
| Output del juez | JSON estructurado `{score, reasoning}` | Parseable, auditable, no prosa libre |
| Temperatura | Baja (0–0.2) | Maximiza consistencia entre corridas |
| Anti-sesgo | No revelar qué respuesta es "del modelo bajo prueba" | Evita sesgo de posición / auto-preferencia |

> ADVERTENCIA: nunca uses como juez el **mismo** modelo que generó la respuesta sin rúbrica estricta — tiende a auto-preferirse (self-enhancement bias). El `reasoning` del juez no es decorativo: es tu evidencia cuando un caso falla en CI.

---

## Detección de Regresiones

El objetivo no es solo "¿pasa el threshold absoluto?" sino "¿empeoré respecto a lo que ya funcionaba?". Un cambio de prompt puede seguir sobre el threshold global y aun así degradar un subconjunto crítico.

### Estrategia: baseline = `last_green_ci`

```yaml
baseline_strategy: last_green_ci   # compara vs último CI verde
regression_max_drop: 0.05          # bloquea si el score baja más de 5% vs baseline
```

- **`last_green_ci`**: el baseline es el score de la última corrida de CI que pasó en la rama principal. Esto evita comparar contra un baseline obsoleto o contra una corrida que ya estaba rota.
- **`max_drop = 0.05`**: tolerancia de ruido. Los LLM tienen varianza inherente entre corridas; una caída menor a 5% no se considera regresión real. Una caída mayor **bloquea el merge**.

### Lógica del detector

```typescript
interface EvalResult {
  metric: string;
  score: number;
}

function detectRegression(
  current: EvalResult[],
  baseline: EvalResult[],
  maxDrop: number,            // p.ej. 0.05
): { regressed: boolean; offenders: string[] } {
  const baselineMap = new Map(baseline.map((r) => [r.metric, r.score]));
  const offenders: string[] = [];

  for (const { metric, score } of current) {
    const prev = baselineMap.get(metric);
    if (prev === undefined) continue;        // métrica nueva, sin baseline aún
    if (prev - score > maxDrop) {            // cayó más que la tolerancia
      offenders.push(
        `${metric}: ${prev.toFixed(3)} → ${score.toFixed(3)} (drop ${(prev - score).toFixed(3)})`,
      );
    }
  }

  return { regressed: offenders.length > 0, offenders };
}
```

> Nota: una métrica **nueva** sin baseline (`prev === undefined`) no debe bloquear — todavía no hay con qué comparar. Su primer valor verde *se convierte* en el baseline para la próxima corrida.

---

## Métricas

Cada métrica resuelve un problema distinto. No las uses todas a ciegas: elige el subconjunto que discrimina en tu dominio.

| Métrica | Qué mide | Rango | Cuándo usarla | Costo |
|---------|----------|-------|---------------|-------|
| `exact_match` | Coincidencia literal con `expected_output` | {0, 1} | Salidas estructuradas, enums, clasificación, IDs | Nulo |
| `semantic_similarity` | Cercanía de significado (embeddings, cosine) | [0, 1] | Respuestas en lenguaje natural donde el parafraseo es válido | Bajo |
| `llm_judge_score` | Calidad cualitativa contra rúbrica | [0, 1] | Razonamiento, tono, completitud — lo que las métricas duras no capturan | Alto |
| `faithfulness` | ¿La respuesta se apoya SOLO en el contexto recuperado? (anti-alucinación) | [0, 1] | Pipelines RAG | Alto |
| `answer_relevance` | ¿La respuesta realmente responde la pregunta? | [0, 1] | Pipelines RAG y QA general | Medio |

### Notas por métrica

- **`exact_match`** es la única binaria. Subir mucho el threshold aquí es realista solo cuando la tarea es cerrada (clasificación, extracción). Para texto libre, casi siempre estará bajo — por eso el default es `0.75`, no `1.0`.
- **`semantic_similarity`** tolera el parafraseo pero NO detecta alucinaciones: dos textos pueden ser semánticamente cercanos y ambos estar mal. Combínala con `llm_judge` o `faithfulness`.
- **`faithfulness`** es la defensa principal contra alucinaciones en RAG: penaliza afirmaciones que no derivan del contexto recuperado, aunque sean ciertas en el mundo real.
- **`answer_relevance`** detecta el caso opuesto: respuestas correctas y bien fundamentadas que NO responden lo que se preguntó.

### Thresholds de referencia

```yaml
thresholds:
  golden_set_exact_match: 0.75
  golden_set_semantic_similarity: 0.85
  llm_judge_score: 0.80
  regression_max_drop: 0.05
```

Los `weights` por métrica en `eval.config.yaml` permiten combinar varias en un score agregado; pondera más alto lo que más importa para tu dominio (p.ej. `faithfulness` en un asistente legal o médico).

---

## Integración con CI

La suite no vale nada si no **bloquea**. Un eval que solo reporta y no falla el pipeline se ignora en la práctica. El threshold gate es bloqueante por diseño.

### `eval.config.yaml` completo

```yaml
thresholds:
  golden_set_exact_match: 0.75
  golden_set_semantic_similarity: 0.85
  llm_judge_score: 0.80
  regression_max_drop: 0.05
judge_model: claude-haiku-4-5
baseline_strategy: last_green_ci
weights:
  exact_match: 0.2
  semantic_similarity: 0.3
  llm_judge_score: 0.3
  faithfulness: 0.1
  answer_relevance: 0.1
```

### Workflow de CI (threshold gate bloqueante)

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

### Comportamiento del gate

| Condición | Resultado |
|-----------|-----------|
| Toda métrica >= su threshold Y `drop <= max_drop` | PASA — el verde se vuelve el nuevo baseline |
| Alguna métrica < su threshold | FALLA — `score < threshold` bloquea |
| Caída > `max_drop` vs `last_green_ci` | FALLA — regresión detectada, bloquea |
| Métrica nueva sin baseline | NO bloquea por regresión; su valor se registra como baseline inicial |

> Los reportes se generan **en CI**, no se commitean (`reports/.gitkeep`). Mantener reportes en el repo genera ruido de diffs y commits espurios; el artefacto vive en el run de CI.

---

## Anti-patrones Comunes

| Anti-patrón | Síntoma | Solución |
|-------------|---------|----------|
| **Golden set solo happy-path** | Evals verdes pero quejas en prod | Agregar `edge-case` y `adversarial` con cobertura explícita en `metadata.json` |
| **Editar casos existentes** | Baselines incomparables, regresiones falsas | Version lock: crear `v2`, nunca mutar `v1` |
| **Juez = modelo bajo prueba sin rúbrica** | Scores inflados (self-preference bias) | Juez distinto o rúbrica estricta + output JSON |
| **Threshold gate no bloqueante** | Evals que nadie mira | `exit != 0` en CI ante fallo de threshold o regresión |
| **Solo métricas duras en texto libre** | `exact_match` siempre bajo, ruidoso | Combinar con `semantic_similarity` + `llm_judge` |
| **Modelo frontier como juez** | Costo de CI desproporcionado | `judge_model: claude-haiku-4-5` |
| **Comparar contra baseline arbitrario** | Regresiones intermitentes/falsas | `baseline_strategy: last_green_ci` |

---

## Checklist de una Suite de Evals Sana

- [ ] Golden set versionado con `metadata.json` y `locked_until` semestral
- [ ] Cobertura `happy-path` + `edge-case` + `adversarial` documentada
- [ ] Métricas elegidas por dominio (no todas a ciegas)
- [ ] Juez en `claude-haiku-4-5` con rúbrica explícita y output JSON
- [ ] `regression_max_drop = 0.05` contra `last_green_ci`
- [ ] Threshold gate **bloqueante** en `pull_request` y `push: main`
- [ ] Reportes generados en CI, no commiteados
- [ ] Si hay RAG: `faithfulness` + `answer_relevance` añadidas al harness
