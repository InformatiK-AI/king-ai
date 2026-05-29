# rag-setup — PHASES (Phases 1-5)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER según la fase activa.
> NUNCA ejecutar directamente — siempre invocado desde `skills/rag-setup/SKILL.md`.
> Formatos de config, schemas y ejemplos de código: ver [REFERENCE.md](REFERENCE.md).

---

## Phase 1: Stack Detection + Prerequisite Check

### GATE IN
- [ ] Phase 0 (session-management) completada

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Verificar prerequisito `llm-integration`** (BLOCKING — escenario Gherkin 3):
   - Buscar evidencia de la integración LLM previa en el proyecto del usuario:
     - Cliente LLM en `src/lib/llm/*-client.ts` (o el `DEST_DIR` que usó `/llm-integration`)
     - Bloque `LLM_PROVIDER` en `.env.example`
     - Session document de `/llm-integration` en `.king/sessions/`
   - Si NO se encuentra evidencia: **DETENER inmediatamente, sin generar ningún archivo**:
     ```
     llm-integration es prerequisito de /rag-setup — ejecutar primero /llm-integration
     ```
   - Si se encuentra: registrar `LLM_CLIENT_PATH` para uso en Phase 4

2. [ ] **Leer `package.json`** del proyecto del usuario (buscar en cwd)

3. [ ] **Detectar TypeScript**: buscar `"typescript"` en `dependencies` / `devDependencies`
   - Si NO es TypeScript: mostrar advertencia y preguntar al usuario (Continuar / Abortar).
     Si elige Abortar: DETENER con `"Configurá TypeScript y volvé a ejecutar /rag-setup."`

4. [ ] **Detectar Postgres** (relevante si `vector_db=pgvector`): buscar `"pg"`, `"postgres"`, `"drizzle-orm"`, `"prisma"` en dependencias o un `DATABASE_URL` en `.env.example`
   - Registrar `HAS_POSTGRES`: true | false

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 2

- [ ] `llm-integration` confirmado como instalado (`LLM_CLIENT_PATH` registrado)
- [ ] Stack detectado o usuario confirmó continuar con advertencia TypeScript
- [ ] `HAS_POSTGRES` registrado

### OUTPUTS
- Ninguno (fase de detección). Variables registradas: `LLM_CLIENT_PATH`, `HAS_POSTGRES`, `DETECTED_TYPESCRIPT`

### IF FAILS
```
llm-integration NO encontrado:
  → BLOCKING. Detener sin generar archivos. Mensaje exacto de prerequisito.
  → NO ofrecer generar el pipeline "parcial sin generation".

package.json no existe:
  → Preguntar el stack manualmente. Registrar respuesta. Continuar.

Postgres no detectado pero vector_db=pgvector:
  → No abortar. Advertir: "pgvector requiere Postgres con extensión vector.
    El schema SQL se generará igual; instalá la extensión antes de correr ingest."
```

---

## Phase 2: Parameter Configuration

### GATE IN
- [ ] Phase 1 completada — prerequisito `llm-integration` confirmado

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Resolver `vector_db`** (default `pgvector`):
   - Validar contra `[pgvector, pinecone, weaviate, chroma]`. Si inválido → BLOCKING (ver SKILL.md).
   - Si `chroma` en contexto de producción: advertir que es anti-patrón salvo corpus pequeño/mononodo.

2. [ ] **Resolver `embedding_model`** (default `text-embedding-3-small`):
   - Opciones: `text-embedding-3-small | text-embedding-3-large | voyage-2`
   - Recordatorio: cambiar de modelo después exige RE-INDEXAR todo el corpus.

3. [ ] **Resolver `chunker`** (default `recursive`):
   - Opciones: `recursive | semantic | sliding_window`
   - Default sensato: `recursive`, `chunk_size: 512`, `overlap: 64` (~12%). `overlap: 0` es anti-patrón.

4. [ ] **Resolver `reranker`** (default `cross-encoder`):
   - Opciones: `cross-encoder | cohere | none`
   - Si `none`: registrar `RERANKER_NONE_WARNING = true` — se emitirá advertencia explícita en logs y en el resumen final (ABSOLUTE RESTRICTION).

5. [ ] **Resolver `eval_framework`** (default `ragas`):
   - Opciones: `ragas | trulens | custom`
   - Si el stack es TypeScript puro y no hay Python: sugerir `custom` runner (ver `llm-evals.md`).

6. [ ] **Confirmar threshold del gate** (default `0.85`) — se escribirá en `.king/quality-gates.yaml`.

7. [ ] **Registrar configuración** para Phases 3-5:
   `VECTOR_DB`, `EMBEDDING_MODEL`, `CHUNKER`, `RERANKER`, `EVAL_FRAMEWORK`, `GOLDEN_SET_THRESHOLD`

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 3

- [ ] Los 5 parámetros resueltos (default o explícito) y validados
- [ ] `RERANKER_NONE_WARNING` registrado si aplica
- [ ] Threshold del gate confirmado

### OUTPUTS
- Ninguno (fase de configuración). Variables de parámetros registradas.

### IF FAILS
```
vector_db fuera de la lista soportada:
  → BLOCKING. Abortar con mensaje de DBs disponibles. Sin código parcial.

Usuario pide reranker=none:
  → No abortar. Registrar warning. Exigir confirmación explícita y documentarla.

eval_framework=ragas pero proyecto sin Python:
  → No abortar. Sugerir custom runner TS. Si el usuario insiste en ragas,
    documentar que requiere un step Python en el CI.
```

---

## Phase 3: Pipeline Code Generation

### GATE IN
- [ ] Phase 2 completada — parámetros registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Crear directorio destino** si no existe: `src/rag/` (y `eval/golden-set/v1/`, `prompts/`, `.github/workflows/` en fases posteriores)

2. [ ] **Para cada archivo, verificar si ya existe** y preguntar ANTES de sobreescribir. NUNCA sobreescribir sin confirmación.

3. [ ] **Generar `src/rag/ingest.ts`** — pipeline `parse → chunk → embed → upsert`:
   - Chunker según `CHUNKER` (default recursive, `chunk_size: 512`, `overlap: 64`)
   - Adjuntar metadata a cada chunk SIEMPRE: `docId`, `position`, `tenantId`, `source`
   - Embebe con `EMBEDDING_MODEL`; upsert a `VECTOR_DB`
   - Si `vector_db=pgvector` y `HAS_POSTGRES`: generar además `src/db/migrations/create_rag_embeddings.sql` con la extensión `vector` + índice ANN (`hnsw`). Ver REFERENCE.md.

4. [ ] **Generar `src/rag/retriever.ts`** — hybrid search:
   - Dense (semantic, mismo `EMBEDDING_MODEL` y métrica cosine) + sparse (BM25 / `tsvector` en pgvector)
   - Fusión Reciprocal Rank Fusion (`k≈60`), `top_k = 20–50` candidatos
   - Filtro `tenantId` / metadata OBLIGATORIO en toda query

5. [ ] **Generar `src/rag/reranker.ts`** — según `RERANKER`:
   - `cross-encoder` (default): rerank de pares (query, doc) → `top_n = 4`
   - `cohere`: API managed `cohere.rerank`
   - `none`: pass-through CON advertencia explícita en logs (`RERANKER_NONE_WARNING`)

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 4

- [ ] `src/rag/ingest.ts` generado con metadata + overlap ≥ 10%
- [ ] `src/rag/retriever.ts` generado con hybrid + RRF + filtro tenant
- [ ] `src/rag/reranker.ts` generado (cross-encoder default o warning si none)
- [ ] (pgvector) migración SQL con índice ANN generada

### OUTPUTS
- `src/rag/ingest.ts`
- `src/rag/retriever.ts`
- `src/rag/reranker.ts`
- (condicional pgvector) `src/db/migrations/create_rag_embeddings.sql`

### IF FAILS
```
mkdir src/rag/ falla (permisos):
  → Pedir al usuario que cree el directorio. Reintentar generación tras confirmación.

Usuario declina sobreescribir un archivo:
  → Saltar ese archivo. Registrarlo como omitido en session document. Continuar.

Falta el embedding provider en el ambiente:
  → No abortar. Documentar la variable de entorno requerida. El código ya usa process.env.*
```

---

## Phase 4: Generator + Orchestrator

### GATE IN
- [ ] Phase 3 completada — ingest/retriever/reranker generados
- [ ] `LLM_CLIENT_PATH` registrado (de Phase 1)

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Generar `prompts/rag-system.md`** ANTES del generator — system prompt versionado en git con changelog. NUNCA inline.

2. [ ] **Generar `src/rag/generator.ts`** — generation con citations:
   - Consumir el cliente LLM existente vía la interfaz `LLMProvider` de `llm-integration` (ADR-004) desde `LLM_CLIENT_PATH`. NO crear un nuevo cliente.
   - Cargar el system prompt desde `prompts/rag-system.md` (no inline)
   - Generar respuesta con citations a los chunks recuperados (anti-alucinación)

3. [ ] **Generar `src/rag/pipeline.ts`** — orchestrator:
   - Expone `ingest(docs)` y `query(question, { tenantId })`
   - Flujo: `query → embed → retrieve (hybrid) → rerank → generate con citations`
   - Inyecta `tenantId` en todas las etapas de retrieval

4. [ ] **Actualizar `.env.example`** (APPEND) con las variables del `VECTOR_DB` y `EMBEDDING_MODEL`. Reusar las del LLM provider ya existentes.

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 5

- [ ] `prompts/rag-system.md` generado (prompt fuera del código)
- [ ] `src/rag/generator.ts` consume `LLMProvider`, no crea cliente nuevo, no hay prompt inline
- [ ] `src/rag/pipeline.ts` orquesta el flujo completo con `tenantId`
- [ ] `.env.example` actualizado sin keys hardcodeadas

### OUTPUTS
- `prompts/rag-system.md`
- `src/rag/generator.ts`
- `src/rag/pipeline.ts`
- `.env.example` (actualizado)

### IF FAILS
```
LLM_CLIENT_PATH no resuelve a un cliente válido:
  → BLOCKING. No improvisar un cliente. Re-verificar Phase 1 (prerequisito llm-integration).

Detectado prompt inline en generator.ts:
  → ERROR. Extraer a prompts/rag-system.md antes de continuar. ABSOLUTE RESTRICTION.

Detectado código LLM client-side / browser:
  → ERROR. Mover a server-side. Generation server-side únicamente.
```

---

## Phase 5: Eval Harness + CI Gate

### GATE IN
- [ ] Phase 4 completada — pipeline funcional (`pipeline.ts` existe)

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Generar `eval/golden-set/v1/cases.json`** con EXACTAMENTE 20 Q&A pairs de ejemplo (bootstrap):
   - Formato `{ id, input, expected_output, tags }` (ver REFERENCE.md y `llm-evals.md`)
   - Cobertura balanceada: `happy-path` + `edge-case` + `adversarial`

2. [ ] **Generar `eval/golden-set/v1/metadata.json`** con version lock:
   - `version: v1`, `created_at`, `locked_until` (+6 meses, rotación semestral), `case_count: 20`, `coverage`

3. [ ] **Generar `eval/golden-set/rotation-schedule.md`** — agenda de rotación semestral (anti-patrón golden set estático)

4. [ ] **Generar el eval runner** según `EVAL_FRAMEWORK`:
   - `ragas` (default): runner Python que reporta `faithfulness`, `answer_relevance`, MRR, NDCG
   - `custom`: `eval/golden-set-runner.ts` + detector de regresión (ver `llm-evals.md`)
   - Entry point de CI: `eval/ci-eval.ts` que computa `golden_set_score` agregado

5. [ ] **Agregar el gate a `.king/quality-gates.yaml`** (APPEND): `ai.eval.golden_set_score: {GOLDEN_SET_THRESHOLD}` y `ai.observability.tracing_coverage_pct: 100`

6. [ ] **Generar `.github/workflows/rag-eval.yml`** — CI que FALLA si `golden_set_score < threshold` (escenario Gherkin 2). Plantilla completa en REFERENCE.md.

7. [ ] **Agregar script `eval` a `package.json`** (`npm run eval` → ejecuta el runner + el gate).

8. [ ] **Ejecutar `npm run eval`** si el ambiente lo permite y reportar `golden_set_score`:
   - `>= threshold` → CHECKPOINT OK
   - `< threshold` → registrar como riesgo; Status final = `PARTIAL`

### CHECKPOINT
> ✅ Verificar antes de FINAL CHECKPOINT

- [ ] `eval/golden-set/v1/cases.json` con exactamente 20 casos + `metadata.json` con `locked_until`
- [ ] `eval/golden-set/rotation-schedule.md` generado
- [ ] Eval runner + `eval/ci-eval.ts` generados
- [ ] `.github/workflows/rag-eval.yml` generado con gate bloqueante (`exit != 0` si score < threshold)
- [ ] `.king/quality-gates.yaml` contiene `golden_set_score`
- [ ] `npm run eval` reporta `golden_set_score >= 0.85` (o documentado como PARTIAL)

### OUTPUTS
- `eval/golden-set/v1/cases.json` (20 Q&A)
- `eval/golden-set/v1/metadata.json`
- `eval/golden-set/rotation-schedule.md`
- `eval/ci-eval.ts` (+ runner según framework)
- `.github/workflows/rag-eval.yml`
- `.king/quality-gates.yaml` (actualizado)
- `package.json` (script `eval`)

### IF FAILS
```
golden_set_score < threshold:
  → NO es BLOCKING de generación: los archivos ya existen.
  → Status final = PARTIAL. Registrar el score y el offender (retrieval vs generation).
  → Diagnóstico: MRR/NDCG bajos → retrieval (chunking/embedding/reranker);
    faithfulness baja → generation (prompt/modelo).
  → Guiar al usuario a ajustar y re-evaluar.

npm run eval no ejecutable en el ambiente (sin API key / sin Python para ragas):
  → No abortar. Documentar el comando y los prerequisitos. El gate corre en CI igual.

rag-eval.yml generado sin exit-on-fail:
  → ERROR. El gate DEBE bloquear (exit != 0). Corregir antes de cerrar.
```
