# MLEngineer-QA Contract

## Propósito
Define el protocolo de interacción entre @ml-engineer y @qa para el handoff del eval harness, el formato del golden set, la detección de regresiones en CI y los threshold gates. @ml-engineer posee la capa T (Testing) en el dominio ML y produce los evals; @qa los integra al pipeline de calidad y bloquea merge ante regresión.

---

## Escenarios de Interacción

| Escenario | Iniciador | Receptor | Tipo | Bloquea |
|-----------|-----------|----------|------|---------|
| Entrega de eval harness + golden set | @ml-engineer | @qa | Eval Harness Handoff | No |
| Regresión de `golden_set_score` detectada en CI | @qa | @ml-engineer | Regression Feedback | Sí |
| Validación de threshold gates antes de merge | @qa | @ml-engineer | Gate Check | Sí |
| Consulta de testabilidad de output de modelo | @ml-engineer | @qa | Quick Consultation | No |
| Golden set desactualizado o corrupto | @qa o @ml-engineer | @ml-engineer | Maintenance Alert | Sí |

---

## Eval Harness Handoff (ML Engineer → QA)

### Cuándo usar
- Una feature AI está lista para integrarse al pipeline de CI
- Se define un nuevo golden set para una capability del producto (RAG, chatbot, clasificación)
- Se actualizan los threshold gates de evaluación

### Handoff Format (@ml-engineer → @qa)

```yaml
# Eval Harness Handoff
type: "eval_harness_handoff"
from: "@ml-engineer"
to: "@qa"
timestamp: "{ISO}"
context:
  skill: "/prompt-eval"
  issue: "#{number}"

harness:
  runner: "Vitest + eval runner"
  golden_set_path: "evals/golden/{capability}.jsonl"
  config_path: "eval.config.yaml"

threshold_gates:
  golden_set_score: 0.85         # gate — pass si score >= 0.85
  regression_tolerance: 0.02     # caída máxima vs baseline antes de fallar
  min_cases: 30                  # tamaño mínimo del golden set

baseline:
  score: 0.89
  locked_version: "{version del golden set en eval.config.yaml}"
  committed_at: "{ISO}"

ci_integration:
  workflow: ".github/workflows/king-ai-ci.yml"
  job: "eval-regression"
  fails_pr_on_regression: true
```

### Golden Set Formato (JSONL — una entrada por línea)

```jsonl
{"id": "case-001", "input": "{prompt o query del usuario}", "expected": "{output esperado o referencia}", "rubric": ["{criterio 1}", "{criterio 2}"], "tags": ["rag", "factual"], "weight": 1.0}
{"id": "case-002", "input": "{...}", "expected": "{...}", "rubric": ["{...}"], "tags": ["edge_case"], "weight": 1.5}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador estable del caso (no reusar tras borrar) |
| `input` | string | Input al modelo (prompt, query, contexto) |
| `expected` | string | Output de referencia o respuesta canónica |
| `rubric` | string[] | Criterios de scoring (para LLM-as-judge o assertion) |
| `tags` | string[] | Categorías para slicing (regresión por subgrupo) |
| `weight` | number | Peso del caso en el score agregado (default 1.0) |

### Acknowledgment (@qa → @ml-engineer)

```yaml
# Eval Harness Ack
type: "eval_harness_ack"
from: "@qa"
to: "@ml-engineer"
in_response_to: "{handoff_timestamp}"

status: "INTEGRATED | NEEDS_CHANGES"

ci_wired: true|false
baseline_locked: true|false

issues:  # solo si status es NEEDS_CHANGES
  - "{golden set tiene < min_cases}"
  - "{rubric ambigua en case-XXX}"
```

---

## Regression Feedback (QA → ML Engineer)

### Cuándo usar
- CI detecta caída de `golden_set_score` por debajo del threshold o de la tolerancia vs baseline
- Un cambio de prompt/modelo degrada un subgrupo (tag) específico
- El eval falla de forma flakey (no determinista)

### Feedback Format (@qa → @ml-engineer)

```yaml
# Eval Regression Feedback
type: "regression_feedback"
from: "@qa"
to: "@ml-engineer"
timestamp: "{ISO}"
context:
  skill: "/qa"
  issue: "#{number}"
  result: "FAILED"

regression:
  metric: "golden_set_score"
  baseline: 0.89
  measured: 0.81
  threshold: 0.85
  delta: -0.08

failing_slices:
  - tag: "{ej: edge_case}"
    baseline: 0.92
    measured: 0.70
    regressed_cases: ["case-014", "case-022"]

probable_cause: |
  {Hipótesis — ej: cambio de system prompt afectó casos factuales}

action_required: "fix_and_resubmit"
blocking: true
```

### Response Format (@ml-engineer → @qa)

```yaml
# Eval Fix Submission
type: "fix_submission"
from: "@ml-engineer"
to: "@qa"
in_response_to: "{feedback_timestamp}"

fixes_applied:
  - change: "{qué se ajustó — prompt, parámetro, retrieval}"
    affected_cases: ["case-014", "case-022"]
    verified_locally: true

new_measurements:
  golden_set_score: 0.88
  failing_slices_resolved: true|false

golden_set_changes:  # solo si se ajustó el golden set, no solo el sistema
  - case_id: "{id}"
    reason: "{por qué cambió la referencia — el expected estaba mal, no el modelo}"

ready_for_retest: true
```

---

## Threshold Gates

Gates que @qa verifica antes de aprobar merge (referencia `.king/quality-gates.yaml` sección ai):

| Gate | Threshold | Enforcement | Owner del fix |
|------|-----------|-------------|---------------|
| `golden_set_score` | >= 0.85 | block | @ml-engineer |
| `regression_tolerance` | caída <= 0.02 vs baseline | block | @ml-engineer |
| Eval determinismo | mismo score en re-run (±0.01) | block si flakey | @ml-engineer |
| Cobertura de tags críticos | todos los tags `critical` con >= 3 casos | warn | @ml-engineer |

---

## Golden Set Maintenance Alert

### Triggers
- El golden set no se rota en > 6 meses (rotación semestral automatizada)
- Casos con `expected` desactualizado respecto al comportamiento correcto actual
- Drift detectado: el baseline ya no representa la realidad del producto

```yaml
# Golden Set Maintenance Alert
type: "maintenance_alert"
from: "@qa | @ml-engineer"
to: "@ml-engineer"
timestamp: "{ISO}"

trigger: "stale_golden_set | outdated_expected | baseline_drift"
golden_set: "evals/golden/{capability}.jsonl"
last_rotation: "{ISO}"

action: "rotar golden set + re-lock baseline en eval.config.yaml"
blocking: true  # un golden set corrupto invalida todos los gates de eval
```

---

## Iteration Loop

### Máximo 2 ciclos regression-fix

```
@qa regression → @ml-engineer fix → @qa re-run eval (ciclo 1)
  → Si sigue bajo threshold:
@qa regression → @ml-engineer fix → @qa re-run eval (ciclo 2)
  → Si persiste: escalar a usuario (¿bajar threshold, cambiar approach, o aceptar deuda?)
```

---

## Señales de Escalación

### @ml-engineer consulta @qa cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| No sabe cómo testear un output no determinista | "¿Cómo evalúo respuestas variables?" | Quick Consultation |
| Quiere wirear eval a CI | "¿Dónde corre el regression detector?" | Eval Harness Handoff |
| Duda si un caso es testeable | "¿Esto se mide con rubric o assertion?" | Quick Consultation |

### @qa escala a @ml-engineer cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| `golden_set_score` cae bajo threshold | "Score 0.81 < 0.85" | Regression Feedback |
| Regresión en un slice específico | "edge_case cayó de 0.92 a 0.70" | Regression Feedback |
| Eval flakey | "Score varía ±0.05 entre runs" | Regression Feedback |
| Golden set obsoleto | "El expected ya no aplica" | Maintenance Alert |

### Escala a usuario cuando:

| Señal | Ejemplo |
|-------|---------|
| 2 ciclos sin recuperar el score | "El modelo no alcanza 0.85 con el approach actual" |
| Threshold parece mal calibrado | "0.85 es inalcanzable para esta capability" |
| Trade-off de calidad requiere decisión | "Bajar threshold o cambiar modelo (más costo)" |

---

## Timeouts y Fallbacks

| Situación | Timeout | Fallback |
|-----------|---------|----------|
| Eval Harness Handoff sin ack | Continuar | @ml-engineer corre eval localmente y reporta |
| Regression Feedback sin fix | N/A (blocking) | Escalar a usuario |
| Eval flakey persistente | N/A (blocking) | Marcar caso como quarantine + escalar |
| Quick Consultation sin respuesta | Continuar sin | Usar assertion determinista + documentar |
| Golden set corrupto sin rotación | N/A (blocking) | Bloquear todos los gates de eval hasta re-lock |

---

## Ver también

- **MLEngineer-Security Contract**: `agents/contracts/ml-engineer-security.md`
- **MLEngineer-Performance Contract**: `agents/contracts/ml-engineer-performance.md`
- **MLEngineer-Developer Contract**: `agents/contracts/ml-engineer-developer.md`
- **Escalation Matrix**: `agents/_common/escalation-matrix.md`
- **Context Handoff**: `agents/_common/context-handoff.md`
- **Prompt Eval**: `/prompt-eval`
