# prompt-eval — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/prompt-eval/SKILL.md`.
> Cada fase sigue el contrato canónico: GATE IN → MUST DO → CHECKPOINT → OUTPUTS → IF FAILS.

---

## PHASE 1: Stack Detection + Casos de Uso

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] `knowledge/domain/llm-evals.md` inyectado o advertencia registrada

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Leer `package.json`** del proyecto del usuario (cwd) y detectar TypeScript (`"typescript"` en `dependencies`/`devDependencies`).
   - Si NO es TypeScript: advertir (los runners generados son `.ts`) y preguntar si continuar. Si el usuario aborta → DETENER (BLOCKING CONDITION).

2. [ ] **Detectar RAG en el proyecto** para decidir la extensión del harness:
   - Buscar señales: skill `/rag-setup` ejecutado (`.king/sessions/*rag*`), dependencias de vector DB (`pgvector`, `@pinecone-database`, `chromadb`, `weaviate`), o carpeta `rag/`.
   - Registrar `HAS_RAG`: true | false (se usa en Phase 4).

3. [ ] **Recolectar casos de uso documentados** para derivar el golden set:
   - Leer `.king/knowledge/` y docs del proyecto en busca de preguntas/respuestas reales, flujos, FAQs, edge cases.
   - Si no hay material suficiente para ≥10 casos: preguntar al usuario por ejemplos concretos (input → expected_output) — NO inventar un golden set vacío (BLOCKING CONDITION `[Gherkin: bootstrap]`).

4. [ ] **Determinar la estrategia de baseline** disponible en el CI:
   - Default `last_green_ci` (recomendado por `llm-evals.md`). Si el CI elegido no puede recuperar el último run verde, preguntar la estrategia alternativa antes de Phase 4 (BLOCKING CONDITION `[Gherkin: regression]`).

5. [ ] **Registrar detecciones** para fases siguientes:
   - `DETECTED_TYPESCRIPT`, `HAS_RAG`, `USE_CASES` (lista bruta de casos), `BASELINE_STRATEGY`.

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 2

- [ ] Stack confirmado (TypeScript o usuario aceptó la advertencia)
- [ ] `HAS_RAG` resuelto (true/false)
- [ ] Material suficiente para ≥10 casos disponible (del knowledge o del usuario)
- [ ] `BASELINE_STRATEGY` resoluble

### OUTPUTS
- Detecciones en memoria de sesión: `DETECTED_TYPESCRIPT`, `HAS_RAG`, `USE_CASES`, `BASELINE_STRATEGY`.

### IF FAILS
```
package.json no existe:
  → Preguntar el stack manualmente; si no es TS, aplicar BLOCKING CONDITION.

Menos de 10 casos derivables y el usuario no aporta ejemplos:
  → DETENER (BLOCKING). Sugerir documentar casos en .king/knowledge/ y reintentar.

No se puede resolver el baseline:
  → DETENER (BLOCKING) hasta acordar baseline_strategy con el usuario.
```

---

## PHASE 2: Golden Set + eval.config.yaml

### GATE IN
- [ ] Phase 1 completada — `USE_CASES` y `HAS_RAG` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Crear estructura de carpetas**:
   ```bash
   mkdir -p eval/golden-set/v1 eval/runners eval/reports .github/workflows
   ```

2. [ ] **Generar `eval/golden-set/v1/cases.json`** con ≥10 casos derivados de `USE_CASES`.
   - Formato CANÓNICO por caso: `{ "id": "<dominio>-NNN", "input": "...", "expected_output": "...", "tags": [...] }`.
   - Cobertura balanceada OBLIGATORIA: al menos `happy-path` + `edge-case` (idealmente `adversarial`). Un golden set de solo happy-path es un anti-patrón.
   - `id` estable y legible (`auth-001`); NUNCA reusar un id eliminado.

3. [ ] **Generar `eval/golden-set/v1/metadata.json`**:
   - `version: "v1"`, `created_at` (fecha actual), `locked_until` (≈ +6 meses, rotación semestral), `case_count`, `coverage: { happy_path, edge_case, adversarial }`, `notes` con la regla de version lock.

4. [ ] **Generar `eval/eval.config.yaml`** con los defaults canónicos:
   - `thresholds`: `golden_set_exact_match: 0.75`, `golden_set_semantic_similarity: 0.85`, `llm_judge_score: 0.80`, `regression_max_drop: 0.05`.
   - `judge_model: claude-haiku-4-5`, `baseline_strategy: last_green_ci`.
   - `weights` por métrica (si `HAS_RAG`, incluir `faithfulness` + `answer_relevance`).
   - Ver formato completo en REFERENCE.md.

5. [ ] **Crear `eval/reports/.gitkeep`** (placeholder vacío). Los reportes NO se commitean.

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 3

- [ ] `cases.json` tiene ≥10 casos con `id` único y `tags` (cobertura `happy-path` + `edge-case`)
- [ ] `metadata.json` con `version`, `created_at`, `locked_until`, `coverage`
- [ ] `eval.config.yaml` con `judge_model: claude-haiku-4-5`, `baseline_strategy: last_green_ci`, `regression_max_drop: 0.05`
- [ ] `eval/reports/.gitkeep` creado

### OUTPUTS
- [ ] `eval/golden-set/v1/cases.json`
- [ ] `eval/golden-set/v1/metadata.json`
- [ ] `eval/eval.config.yaml`
- [ ] `eval/reports/.gitkeep`

### IF FAILS
```
mkdir falla (permisos):
  → Pedir al usuario crear las carpetas; reintentar solo la generación de archivos.

cases.json queda con < 10 casos:
  → Volver a Phase 1 a recolectar más material; NO publicar un golden set incompleto.

Cobertura desbalanceada (solo happy-path):
  → WARNING; agregar edge-case/adversarial y reflejarlo en metadata.coverage.
```

---

## PHASE 3: Runners (golden-set-runner, llm-judge, regression-detector)

### GATE IN
- [ ] Phase 2 completada — `cases.json`, `eval.config.yaml` existen
- [ ] `DETECTED_TYPESCRIPT` confirmado (o advertencia aceptada)

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Generar `eval/runners/golden-set-runner.ts`**:
   - Lee `cases.json` y `eval.config.yaml`, ejecuta el sistema bajo prueba por cada caso.
   - Calcula `exact_match` (binario) y `semantic_similarity` (embeddings/cosine).
   - Escribe el reporte en `eval/reports/` (NO commiteado). Retorna `exit != 0` si alguna métrica < su threshold.
   - Esqueleto en REFERENCE.md.

2. [ ] **Generar `eval/runners/llm-judge.ts`**:
   - LLM-as-judge con rúbrica configurable. `judge_model` desde `eval.config.yaml` (default `claude-haiku-4-5`), temperatura baja (0–0.2).
   - Output del juez SOLO JSON `{ "score": 0.0-1.0, "reasoning": "..." }` por caso.
   - API key exclusivamente desde `process.env.ANTHROPIC_API_KEY`. Anti-sesgo: no revelar qué respuesta es del modelo bajo prueba.
   - Retorna `exit != 0` si `llm_judge_score` agregado < threshold.

3. [ ] **Generar `eval/runners/regression-detector.ts`**:
   - Compara el run actual contra el baseline (`baseline_strategy: last_green_ci`).
   - Lógica: por métrica, si `prev - score > regression_max_drop` → offender. Una métrica NUEVA sin baseline NO bloquea (su valor verde se vuelve baseline).
   - Mensaje de fallo: `"regression detected: <prev>→<score> (drop <delta> > max_drop 0.05)"` `[Gherkin: regression en CI]`.
   - Implementación de referencia en REFERENCE.md (`detectRegression`).

4. [ ] **Agregar scripts a `package.json`** (APPEND, no sobreescribir):
   - `"eval"`: corre golden-set + judge + regression en secuencia.
   - `"eval:golden-set"`, `"eval:judge"`, `"eval:regression"`: steps individuales para el CI.

5. [ ] **Verificar si cada runner ya existe** antes de escribir; si existe, preguntar antes de sobreescribir. NUNCA sobreescribir sin confirmación.

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 4

- [ ] `golden-set-runner.ts`, `llm-judge.ts`, `regression-detector.ts` generados
- [ ] `judge_model` y thresholds leídos desde `eval.config.yaml` (no hardcodeados)
- [ ] Scripts `eval`, `eval:golden-set`, `eval:judge`, `eval:regression` en `package.json`
- [ ] Ningún runner contiene API key hardcodeada (solo `process.env.ANTHROPIC_API_KEY`)

### OUTPUTS
- [ ] `eval/runners/golden-set-runner.ts`
- [ ] `eval/runners/llm-judge.ts`
- [ ] `eval/runners/regression-detector.ts`
- [ ] Scripts `npm run eval*` en `package.json`

### IF FAILS
```
package.json sin sección scripts:
  → Crear la sección scripts con los 4 comandos eval.

Runner ya existe y el usuario declina sobreescribir:
  → Saltar ese archivo; registrar el omitido en el session document.

Dependencia de embeddings/SDK ausente:
  → Documentar el npm install requerido en el resumen final; no bloquear la generación.
```

---

## PHASE 4: CI Gate + Extensión RAG

### GATE IN
- [ ] Phase 3 completada — runners y scripts existen

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Generar `.github/workflows/prompt-eval.yml`**:
   - `on: push: branches: [main]` + `pull_request`.
   - Steps: checkout → `npm ci` → `npm run eval:golden-set` → `npm run eval:judge` → `npm run eval:regression`.
   - `env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}`.
   - Cualquier step con `exit != 0` BLOQUEA el merge (threshold gate bloqueante). Plantilla en REFERENCE.md.

2. [ ] **Si `HAS_RAG` (Phase 1)**: extender el harness con métricas estilo Ragas:
   - Agregar casos con campo de contexto recuperado y/o un runner `eval/runners/rag-metrics.ts` que calcule `faithfulness` y `answer_relevance`.
   - Añadir sus thresholds y `weights` a `eval.config.yaml`.
   - El harness se EXTIENDE, no se reemplaza (ver `llm-evals.md` §Frameworks).

3. [ ] **Security gate** — buscar API keys hardcodeadas en runners y workflow:
   ```bash
   grep -rn "sk-ant-\|ANTHROPIC_API_KEY *= *['\"]" eval/runners .github/workflows
   ```
   - Si encuentra coincidencias: ERROR CRÍTICO, remediar a `process.env`/`secrets` y re-ejecutar el grep. NO continuar con keys hardcodeadas.

4. [ ] **Dry-run / verificación de ejecución**:
   - Ejecutar `npm run eval` (o documentar el comando si faltan credenciales/deps) y confirmar que reporta un score inicial sin error `[Gherkin: npm run eval ejecuta sin error]`.

5. [ ] **Mostrar resumen** con paths exactos de los artefactos y próximos pasos (configurar `ANTHROPIC_API_KEY_TEST` en secrets del repo, primer run verde = baseline inicial).

### CHECKPOINT
> ✅ Verificar antes de Phase N+1 (FINAL CHECKPOINT)

- [ ] `.github/workflows/prompt-eval.yml` corre en `push: main` + `pull_request` y es bloqueante
- [ ] Si `HAS_RAG`: `faithfulness` + `answer_relevance` integradas (runner + config)
- [ ] Security gate pasado (grep sin keys hardcodeadas)
- [ ] `npm run eval` ejecuta sin error o el comando quedó documentado con sus prerequisitos
- [ ] Resumen presentado al usuario

### OUTPUTS
- [ ] `.github/workflows/prompt-eval.yml`
- [ ] (Si RAG) `eval/runners/rag-metrics.ts` + thresholds/weights en `eval.config.yaml`

### IF FAILS
```
Security gate encuentra key hardcodeada:
  → ERROR CRÍTICO — no continuar a N+1. Remediar y re-ejecutar el grep completo.

npm run eval falla por credenciales/deps:
  → No es BLOCKING si se documenta. Registrar el comando exacto y los prerequisitos
    (ANTHROPIC_API_KEY, npm install de embeddings) en el resumen y session document.

CI ya tiene un workflow homónimo:
  → Preguntar antes de sobreescribir; ofrecer un nombre alternativo (prompt-eval-2.yml).
```
