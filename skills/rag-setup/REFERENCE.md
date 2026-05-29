# rag-setup — REFERENCE

> 📚 Información de referencia. Esta sección NO contiene acciones — documenta formatos, schemas y ejemplos.
> Las fases ejecutables están en [PHASES.md](PHASES.md).

---

## Parámetros del skill

```yaml
inputs:
  vector_db: pinecone | weaviate | pgvector | chroma          # default: pgvector
  embedding_model: text-embedding-3-small | text-embedding-3-large | voyage-2  # default: text-embedding-3-small
  chunker: recursive | semantic | sliding_window              # default: recursive
  reranker: cross-encoder | cohere | none                     # default: cross-encoder
  eval_framework: ragas | trulens | custom                    # default: ragas
```

| Parámetro | Default | Notas |
|-----------|---------|-------|
| `vector_db` | `pgvector` | Si ya usás Postgres: cero infra nueva, filtrado metadata trivial vía SQL |
| `embedding_model` | `text-embedding-3-small` | Cambiarlo después exige RE-INDEXAR todo el corpus |
| `chunker` | `recursive` | `chunk_size: 512`, `overlap: 64` (~12%). Overlap 0 es anti-patrón |
| `reranker` | `cross-encoder` | `none` solo con advertencia explícita; `cohere` = API managed |
| `eval_framework` | `ragas` | `custom` para stack TypeScript puro; lo importante es que corra en CI |

---

## Estructura de directorios generada

```
src/rag/
├── ingest.ts             → parse → chunk → embed → upsert
├── retriever.ts          → hybrid search (semantic + BM25, RRF)
├── reranker.ts           → cross-encoder reranker
├── generator.ts          → LLM generation con citations (usa LLMProvider)
└── pipeline.ts           → orchestrator: query → retrieve → rerank → generate

src/db/migrations/        (solo si vector_db=pgvector)
└── create_rag_embeddings.sql

eval/golden-set/
├── v1/
│   ├── cases.json        → 20 Q&A pairs de bootstrap
│   └── metadata.json     → version lock + coverage
├── rotation-schedule.md  → rotación semestral
ci-eval.ts                → entry point de CI (golden_set_score agregado)

prompts/
└── rag-system.md         → system prompt versionado en git

.github/workflows/
└── rag-eval.yml          → CI gate bloqueante

.king/
└── quality-gates.yaml    → ai.eval.golden_set_score: 0.85
```

---

## Pipeline mínimo viable (arquitectura)

```
parse → chunk → embed → upsert            (ingest)
query → embed → retrieve (semantic + BM25) → rerank → generate con citations
```

El reranker NO es opcional. El golden set NO es estático. El prompt NO va inline.
Quitar cualquiera de los tres = demo, no sistema. (Ver `knowledge/_inject/rag-patterns.md`.)

---

## Contrato del pipeline (TypeScript)

El `generator.ts` reutiliza la interfaz `LLMProvider` de `llm-integration` (ADR-004 del skill `llm-integration`):

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  getCapabilities(): ProviderCapabilities;
}

// Contrato estable del orchestrator (pipeline.ts)
interface RagPipeline {
  ingest(docs: SourceDoc[]): Promise<IngestReport>;
  query(question: string, opts: { tenantId: string; topN?: number }): Promise<RagAnswer>;
}

interface RagAnswer {
  answer: string;
  citations: Citation[];      // chunk.docId + position que soportan la respuesta
  retrievedCount: number;
  rerankedCount: number;
}
```

### Ejemplo: hybrid retrieval con RRF (retriever.ts)

```typescript
// filtro tenantId OBLIGATORIO en toda query — anti fuga multi-tenant
const dense = await vectorSearch(embed(query), { topK: 30, filter: { tenantId } });
const sparse = await bm25Search(query, { topK: 30, filter: { tenantId } });
const fused = reciprocalRankFusion([dense, sparse], { k: 60 });
const candidates = fused.slice(0, 25); // pasa al reranker
```

### Ejemplo: cross-encoder rerank (reranker.ts)

```typescript
// el paso que separa demo de producto: retrieve da recall, rerank da precision
const reranked = await crossEncoder.rerank(query, candidates); // pares (q, doc)
const context = reranked.slice(0, 4);                          // top-n al generador
```

### Ejemplo: generator que consume LLMProvider (generator.ts)

```typescript
import { readFileSync } from 'node:fs';
import type { LLMProvider } from '../lib/llm/types'; // de llm-integration

const systemPrompt = readFileSync('prompts/rag-system.md', 'utf-8'); // NUNCA inline

export async function generate(
  llm: LLMProvider,            // cliente existente de llm-integration — NO crear uno nuevo
  question: string,
  context: RankedChunk[],
): Promise<RagAnswer> {
  const res = await llm.complete({
    system: systemPrompt,
    messages: [{ role: 'user', content: buildContextBlock(question, context) }],
  });
  return { answer: res.text, citations: extractCitations(context), ...meta };
}
```

---

## Schema SQL pgvector (create_rag_embeddings.sql)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_embeddings (
  id          BIGSERIAL PRIMARY KEY,
  doc_id      TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  position    INT  NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,        -- text-embedding-3-small
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);

-- índice ANN: sin esto la búsqueda es secuencial y muere al escalar
CREATE INDEX rag_embeddings_hnsw ON rag_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX rag_embeddings_tsv  ON rag_embeddings USING gin (tsv);          -- BM25 / keyword
CREATE INDEX rag_embeddings_tenant ON rag_embeddings (tenant_id);            -- filtro multi-tenant
```

> Cambiar `embedding_model` exige re-indexar: `vector(1536)` corresponde a `text-embedding-3-small`. `text-embedding-3-large` es `vector(3072)`.

---

## Golden set — formato cases.json

20 Q&A pairs de bootstrap. Formato por caso (ver `knowledge/domain/llm-evals.md`):

```json
[
  {
    "id": "rag-001",
    "input": "¿Cómo configuro el chunk overlap por defecto?",
    "expected_output": "recursive con chunk_size 512 y overlap 64 (~12%); overlap 0 es anti-patrón.",
    "tags": ["chunking", "happy-path"]
  },
  {
    "id": "rag-014",
    "input": "Pregunta cuya respuesta está partida entre dos chunks distantes.",
    "expected_output": "El reranker recupera ambos chunks relevantes y la respuesta los cita.",
    "tags": ["retrieval", "edge-case"]
  }
]
```

| Campo | Tipo | Propósito |
|-------|------|-----------|
| `id` | `string` | `rag-NNN` estable. NUNCA reusar un id eliminado |
| `input` | `string` | Pregunta tal como llegaría en producción |
| `expected_output` | `string` | Respuesta de referencia (intención correcta, no literal) |
| `tags` | `string[]` | `happy-path` / `edge-case` / `adversarial` + dominio |

### metadata.json (version lock — inmutable)

```json
{
  "version": "v1",
  "created_at": "2026-05-28",
  "locked_until": "2026-11-28",
  "case_count": 20,
  "coverage": { "happy_path": 10, "edge_case": 7, "adversarial": 3 },
  "notes": "Baseline inicial RAG. No modificar casos existentes; agregar solo en v2."
}
```

> **Version lock**: una versión publicada del golden set es inmutable. Corregir un caso = crear `v2`, nunca editar `v1`. Rotación semestral en `eval/golden-set/rotation-schedule.md`.

---

## Quality gate (.king/quality-gates.yaml)

```yaml
ai:
  eval:
    golden_set_score: 0.85       # CI falla por debajo (configurable)
  observability:
    tracing_coverage_pct: 100
```

---

## Métricas de eval

| Métrica | Mide | Etapa | Diagnóstico si baja |
|---------|------|-------|---------------------|
| `MRR` | Posición del primer chunk relevante | Retrieval | chunking / embedding / reranker |
| `NDCG@k` | Calidad del ranking completo | Retrieval | chunking / embedding / reranker |
| `faithfulness` | ¿Respuesta soportada por los chunks? | Generation | prompt / modelo (la más crítica) |
| `answer_relevance` | ¿Responde la pregunta? | Generation | prompt / modelo |

Separar SIEMPRE retrieval (MRR/NDCG) de generation (faithfulness/answer_relevance) permite diagnosticar dónde regresionó. Detalle en `knowledge/domain/llm-evals.md`.

---

## GitHub Actions workflow — rag-eval.yml (tarea B-05)

CI bloqueante: cualquier step con `exit != 0` impide el merge. El runner `eval/ci-eval.ts` debe terminar con exit code 1 si `golden_set_score < threshold`, emitiendo el mensaje `"golden_set_score <score> < threshold <threshold>"` (escenario Gherkin 2).

```yaml
# .github/workflows/rag-eval.yml
name: rag-eval

on:
  push:
    branches: [main]
  pull_request:

jobs:
  rag-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      # Servicio Postgres + pgvector para el retrieval del eval (si vector_db=pgvector)
      - name: Start pgvector
        run: |
          docker run -d --name pgvector -p 5432:5432 \
            -e POSTGRES_PASSWORD=postgres \
            pgvector/pgvector:pg16
          until docker exec pgvector pg_isready -U postgres; do sleep 1; done

      - name: Seed corpus + run ingest
        run: npm run rag:ingest -- --fixtures eval/golden-set/v1
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres

      # Gate bloqueante: ci-eval.ts ejecuta el golden set y sale != 0 si score < threshold
      - name: RAG eval gate (golden_set_score)
        run: npm run eval
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_TEST }}
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
          GOLDEN_SET_THRESHOLD: "0.85"
    # Si golden_set_score < threshold → "golden_set_score 0.72 < threshold 0.85" + exit 1 → bloquea el merge.
```

> Los reportes del eval se generan EN CI (artefacto del run), NO se commitean — `reports/.gitkeep`. Solo `cases.json` y `metadata.json` viven en git.

### Comportamiento del gate

| Condición | Resultado |
|-----------|-----------|
| `golden_set_score >= threshold` | PASA — el PR puede mergearse |
| `golden_set_score < threshold` | FALLA — `"golden_set_score <score> < threshold <threshold>"`, exit 1, bloquea merge |
| `npm ci` o ingest fallan | FALLA — error de setup, bloquea |

---

## Anti-patrones que el skill previene activamente

| Anti-patrón | Prevención en el skill |
|-------------|------------------------|
| RAG sin reranking | Cross-encoder por default; `--reranker=none` exige advertencia explícita (ABSOLUTE RESTRICTION) |
| Golden set estático | `eval/golden-set/rotation-schedule.md` (rotación semestral) + `metadata.json` con `locked_until` |
| Prompt inline en código | `prompts/rag-system.md` versionado en git; el generator lo carga, nunca lo embebe |
| Cambiar embedding sin re-indexar | Advertencia en Phase 2; dimensión del vector atada al modelo en el schema SQL |
| `chunk_overlap: 0` | Default `overlap: 64` (~12%) en Phase 3 |
| Sin filtro `tenant_id` | Filtro de metadata obligatorio en retriever.ts y pipeline.ts (ABSOLUTE RESTRICTION) |

---

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/rag-patterns.md` | Chunking, embeddings, vector DBs, retrieval, reranking, eval metrics, anti-patrones | No (graceful: si falta, advertir y continuar) | framework |
| `knowledge/domain/llm-evals.md` | Golden sets, LLM-as-judge, detección de regresiones, thresholds, CI gate | No (graceful) | framework |
| `knowledge/domain/engram-integration.md` | Patrón Engram first-class (mem_context / mem_save / mem_session_summary), AI Audit Ledger, fallback a Chronicle | No (graceful) | framework |

> Si un archivo de knowledge no existe: advertir al usuario y continuar (graceful degradation), nunca bloquear por su ausencia.

---

## ADRs

### ADR: prerequisito `llm-integration`

`/rag-setup` NO genera su propio cliente LLM. El `generator.ts` consume la interfaz `LLMProvider` ya generada por `/llm-integration`. Si el prerequisito no está, el skill se detiene en Phase 1 sin generar archivos (escenario Gherkin 3). Esto evita duplicar la lógica de provider, streaming y cost tracking.

### ADR: chunker y retriever agnósticos al provider

El chunking, el embedding storage y el retrieval no dependen del LLM provider. Solo el paso de generation lo hace. Esto permite cambiar de Claude a OpenAI sin tocar el pipeline de retrieval, y permite evaluar retrieval (MRR/NDCG) independientemente de la generation (faithfulness).
