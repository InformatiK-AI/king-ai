# RAG Patterns Essentials (para inyección)

> Versión compacta para inyección en `/rag-setup`. Referencia experta, accionable. Para deep dive de evals: `knowledge/domain/llm-evals.md`

Un RAG de producción no es "embeddings + similarity search". Es un pipeline con DECISIONES en cada etapa: chunking, embedding, storage, retrieval, reranking y eval. Cada default mal elegido degrada recall o precision sin que el código falle. Esta referencia documenta los tradeoffs.

## Pipeline Mínimo Viable

```
parse → chunk → embed → upsert (ingest)
query → embed → retrieve (semantic + BM25) → rerank → generate con citations
```

El reranker NO es opcional. El golden set NO es estático. El prompt NO va inline. Si quitas cualquiera de estos tres, tienes un demo, no un sistema.

## 1. Chunking Strategies

El chunk es la UNIDAD DE RECALL: si la respuesta está partida entre dos chunks, ningún retriever la recupera completa. Demasiado grande diluye el embedding; demasiado chico pierde contexto.

| Strategy | Cómo parte | Cuándo usarla | Costo / Complejidad |
|----------|-----------|---------------|---------------------|
| `recursive` | Por separadores jerárquicos (`\n\n` → `\n` → `. ` → ` `) respetando `chunk_size` + `overlap` | DEFAULT. Texto genérico, docs, prosa, código. Robusto y barato. | Bajo. Sin llamadas LLM. |
| `semantic` | Embebe oraciones y corta donde la similitud coseno entre vecinas cae bajo un umbral | Contenido heterogéneo donde los límites temáticos no coinciden con saltos de línea (reportes largos, transcripts) | Alto. Requiere embeddings en ingestion. |
| `sliding_window` | Ventana de tamaño fijo con solapamiento fuerte (ej. 512 tokens, overlap 50%) | Recall crítico, queries que cruzan fronteras de chunk, contenido denso (legal, médico) | Medio. Más chunks → más storage y más costo de embedding. |

**Reglas prácticas**:
- Empieza con `recursive`, `chunk_size: 512` tokens, `overlap: 64` (~12%). Mide, luego ajusta.
- El `overlap` existe para no decapitar ideas en el borde. 0% overlap es un anti-patrón silencioso.
- Adjunta metadata a cada chunk SIEMPRE: `source`, `doc_id`, `position`, `tenant_id`. La metadata habilita filtrado pre-retrieval (multi-tenant, fecha, tipo).

```typescript
// recursive — el default sensato
const chunks = splitRecursive(doc.text, {
  chunkSize: 512,
  overlap: 64,
  separators: ["\n\n", "\n", ". ", " "],
})
chunks.forEach((c, i) => upsert({
  text: c, embedding: embed(c),
  metadata: { docId: doc.id, position: i, tenantId: doc.tenantId },
}))
```

## 2. Embedding Models

El embedding define el TECHO de tu retrieval semántico. Más dimensiones = más matiz capturado, pero más costo de storage, más latencia de búsqueda y más RAM en el índice.

| Model | Dims | Tradeoff | Cuándo |
|-------|------|----------|--------|
| `text-embedding-3-small` | 1536 (reducible a 256/512 con `dimensions`) | DEFAULT. Mejor relación costo/calidad. Truncado por Matryoshka: bajar dims con degradación mínima | Mayoría de los casos. Arranca aquí. |
| `text-embedding-3-large` | 3072 (reducible) | ~6.5x el costo de small por mejor recall en corpus grandes o dominios sutiles | Solo si el eval demuestra que small no alcanza el threshold |
| `voyage-2` (`voyage-large-2`) | 1024 / 1536 | Fuerte en código y dominios técnicos/legales; provider distinto a OpenAI | Corpus de código o legal donde voyage gana en benchmarks del dominio |

**Reglas prácticas**:
- NO cambies de modelo de embedding sin RE-INDEXAR todo el corpus. Vectores de modelos distintos no son comparables. Es el error #1 en migraciones.
- Normaliza siempre la métrica: cosine para estos modelos. Mezclar cosine y dot-product silenciosamente arruina el ranking.
- Reducir dimensiones (Matryoshka) es la palanca barata: `3-small` a 512 dims suele bastar y abarata índice + búsqueda.
- Embebe query y documento con el MISMO modelo y la MISMA normalización.

## 3. Vector DBs

La elección depende de operación, no de benchmarks de QPS. La pregunta correcta: ¿ya tienes Postgres? ¿necesitas filtrado por metadata? ¿quieres self-host?

| DB | Modelo | Filtrado metadata | Hybrid nativo | Cuándo |
|----|--------|-------------------|---------------|--------|
| `pgvector` | Extensión de Postgres | Excelente (SQL `WHERE`) | Sí (con `tsvector` para BM25) | DEFAULT si ya usas Postgres. Cero infra nueva, transaccional, backups que ya tienes |
| `pinecone` | SaaS managed | Bueno (metadata filters) | Sí (sparse-dense) | Escala grande sin querer operar infra. Pagas por no gestionar |
| `weaviate` | Self-host u OSS cloud | Muy bueno (GraphQL) | Sí (BM25 + vector built-in) | Hybrid first-class, schema rico, quieres OSS controlable |
| `chroma` | Embebido / local | Básico | Limitado | Prototipos, dev local, notebooks. NO para producción seria |

**Reglas prácticas**:
- Si dudas: `pgvector`. La feature que más se subestima es el filtrado por metadata, y SQL la hace trivial.
- Crea índice ANN (`hnsw` o `ivfflat` en pgvector). Sin índice, la búsqueda es secuencial y muere al escalar.
- `chroma` en producción es un anti-patrón salvo corpus pequeño y mononodo.

## 4. Retrieval Modes

| Modo | Mecanismo | Fortaleza | Debilidad |
|------|-----------|-----------|-----------|
| `semantic` (dense) | Similitud de embeddings | Sinónimos, paráfrasis, intención | Pierde términos exactos, IDs, códigos, nombres propios raros |
| `keyword` (BM25, sparse) | Frecuencia de términos (TF-IDF mejorado) | Términos exactos, jerga, SKUs, acrónimos | Cero comprensión semántica; no entiende sinónimos |
| `hybrid` | Fusiona dense + BM25 (RRF — Reciprocal Rank Fusion) | Lo mejor de ambos. RECOMENDADO en producción | Dos índices, requiere tuning del peso de fusión |

**Reglas prácticas**:
- Producción seria = `hybrid`. Semantic solo falla en queries con identificadores exactos; BM25 solo falla en paráfrasis. Juntos se cubren.
- Recupera GENEROSO antes de rerankear: `top_k = 20–50` candidatos. El reranker reduce a los 3–5 finales. Retrieval barato + rerank caro sobre pocos.
- Fusión: Reciprocal Rank Fusion (`score = Σ 1/(k + rank)`, `k≈60`) es robusta y no requiere normalizar scores entre índices.

```typescript
// hybrid retrieval con RRF
const dense = await vectorSearch(embed(query), { topK: 30, filter: { tenantId } })
const sparse = await bm25Search(query, { topK: 30, filter: { tenantId } })
const fused = reciprocalRankFusion([dense, sparse], { k: 60 })
const candidates = fused.slice(0, 25) // pasa al reranker
```

## 5. Reranking (OBLIGATORIO)

Por qué es obligatorio: el retriever optimiza RECALL barato (traer todo lo relevante), no PRECISION. El bi-encoder embebe query y doc por separado — nunca los compara directamente. Un cross-encoder los procesa JUNTOS en un solo forward pass y mide relevancia real query↔doc. La diferencia en precision@3 suele ser brutal (0.5 → 0.85+).

| Reranker | Mecanismo | Tradeoff |
|----------|-----------|----------|
| `cross-encoder` | Modelo local (ej. `bge-reranker`, `ms-marco-MiniLM`) sobre pares (query, doc) | DEFAULT. Sin costo por llamada, sin dependencia externa, latencia ~10–50ms para 25 docs |
| `cohere` | API `cohere.rerank` managed | Calidad SOTA sin operar modelo, pero costo por request + latencia de red + dependencia externa |
| `none` | Pasa retrieval directo al LLM | ANTI-PATRÓN. Solo con `--reranker=none` + advertencia explícita en logs |

**Reglas prácticas**:
- Rerankea SIEMPRE antes de generar. `retrieve top_k=25 → rerank → top_n=4 → generate`.
- El reranker es lo que más sube faithfulness: menos chunks irrelevantes en el contexto = menos alucinación.
- `none` solo es defendible en latencia extrema (p99 < 100ms) y con eval que pruebe que la precision aguanta.

```typescript
// cross-encoder rerank — el paso que separa demo de producto
const reranked = await crossEncoder.rerank(query, candidates) // pares (q, doc)
const context = reranked.slice(0, 4)                            // top-n al generador
```

## 6. Eval Metrics

"Funciona en mis 3 queries de prueba" no es eval. Necesitas un golden set y métricas que separen RETRIEVAL de GENERATION.

| Métrica | Mide | Etapa | Interpretación |
|---------|------|-------|----------------|
| `MRR` (Mean Reciprocal Rank) | Posición del primer chunk relevante (`1/rank`) | Retrieval | 1.0 = relevante siempre primero. Cae rápido si lo relevante aparece en posición 3+ |
| `NDCG@k` | Calidad del ranking completo, penalizando relevantes mal posicionados | Retrieval | 1.0 = orden ideal. Mejor que MRR cuando hay múltiples chunks relevantes |
| `faithfulness` | ¿La respuesta está SOPORTADA por los chunks recuperados? (anti-alucinación) | Generation | Bajo = el LLM inventa fuera del contexto. La métrica más crítica |
| `answer relevance` | ¿La respuesta responde la PREGUNTA? | Generation | Bajo = respuesta correcta pero off-topic |

**Reglas prácticas**:
- Separa siempre las dos familias: si MRR/NDCG están bien pero faithfulness está mal → problema de generación (prompt/modelo). Si MRR está mal → problema de retrieval (chunking/embedding/reranker). El eval debe permitir ESE diagnóstico.
- Golden set mínimo: 20 pares Q&A para bootstrap; crece a 100+ con casos reales de producción.
- `golden_set_score` es un quality gate de CI: el pipeline FALLA si baja del threshold (default `0.85`). Sin gate, las regresiones de retrieval pasan silenciosas a producción.
- Frameworks: `ragas` (default), `trulens`, o custom. Lo importante es que corra en CI, no cuál.

```yaml
# .king/quality-gates.yaml
ai:
  eval:
    golden_set_score: 0.85    # CI falla por debajo
  observability:
    tracing_coverage_pct: 100
```

## Anti-Patrones (el skill los previene activamente)

| Anti-patrón | Por qué duele | Prevención |
|-------------|---------------|------------|
| **RAG sin reranking** | El retriever da recall, no precision. Contexto sucio → alucinación. Demo, no producto | Cross-encoder reranker por default. `--reranker=none` exige advertencia explícita |
| **Golden set estático** | El corpus y las queries evolucionan; un golden set congelado mide un mundo que ya no existe. Falsa confianza | Rotación semestral generada en `eval/rotation-schedule.md` |
| **Prompt inline en código** | Sin versionado, sin diff, sin revisión. Nadie sabe qué cambió ni cuándo regresionó | Prompts en `prompts/` con changelog git-tracked |
| **Cambiar embedding sin re-indexar** | Vectores de modelos distintos no son comparables → ranking basura silencioso | Re-indexar TODO el corpus al cambiar de modelo |
| **`chunk_overlap: 0`** | Ideas decapitadas en el borde del chunk → recall perdido sin error visible | Overlap ≥10% del `chunk_size` |
| **Sin filtro `tenant_id` en retrieval** | Fuga de datos entre tenants. CRÍTICO en multi-tenant | Filtro por metadata obligatorio en toda query |

## Checklist Pre-Entrega

- [ ] Chunking con `overlap` ≥ 10% y metadata (`docId`, `position`, `tenantId`) en cada chunk
- [ ] Mismo embedding model + métrica (cosine) en ingestion y query
- [ ] Índice ANN creado (hnsw/ivfflat) — no búsqueda secuencial
- [ ] Retrieval `hybrid` (semantic + BM25) con fusión RRF
- [ ] Reranker activo (cross-encoder default); `none` solo con advertencia
- [ ] `top_k` generoso al retrieval, `top_n` reducido al generador
- [ ] Filtro `tenant_id` / metadata en TODA query de retrieval
- [ ] Golden set ≥ 20 pares + `golden_set_score` como gate de CI
- [ ] Eval separa métricas de retrieval (MRR/NDCG) y generation (faithfulness/answer relevance)
- [ ] System prompt en `prompts/` versionado en git, no inline
- [ ] Rotación de golden set agendada (`eval/rotation-schedule.md`)
