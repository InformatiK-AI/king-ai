---
name: rag-setup
version: 1.0
api_version: 1.0.0
description: "Skill para generar un RAG pipeline completo de producción en el proyecto del usuario — vector DB, embedding pipeline, chunker, retriever, reranker, generator con citations y eval harness con golden set. Usar cuando se necesite: configurar RAG, setup de retrieval augmented generation, agregar búsqueda semántica sobre documentos, pipeline ingest→retrieve→rerank→generate, vector database (pgvector/pinecone/weaviate/chroma), eval harness con ragas, golden set de Q&A."
---

# /rag-setup — RAG Pipeline Production Setup

Skill que genera un pipeline RAG listo para producción en el proyecto del usuario: ingestion (parse→chunk→embed→upsert), hybrid retrieval (semantic + BM25), cross-encoder reranker, generation con citations, y un eval harness con golden set que bloquea el CI si la calidad cae bajo el threshold. Reutiliza la integración `llm-integration` existente para el paso de generation — el chunker y el retriever son agnósticos al provider.

## Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/rag-patterns.md` | Chunking, embedding models, vector DBs, retrieval, reranking, eval metrics | Sí | framework |
| `knowledge/domain/llm-evals.md` | Golden set, métricas (MRR/NDCG/faithfulness), regression, CI gate | Sí | framework |
| `knowledge/domain/engram-integration.md` | Pattern Engram first-class (Phase 0 / N+1) | Sí | framework |

> Si un archivo de knowledge no existe: advertir y continuar (degradación grácil). NUNCA bloquear por knowledge faltante.

---

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Si alguna es TRUE, DETENER inmediatamente — NO generar ningún archivo

- [ ] El proyecto NO tiene `llm-integration` configurado (prerequisito) → detener con:
  `"llm-integration es prerequisito de /rag-setup — ejecutar primero /llm-integration"` — NO generar ningún archivo
- [ ] `vector_db` especificado vía `--vector-db` no está en la lista soportada → reportar error y abortar:
  `"Vector DB no soportado. Disponibles: [pgvector, pinecone, weaviate, chroma]"` — sin código parcial
- [ ] El proyecto detectado no es TypeScript/JavaScript — advertir y preguntar (ver PHASES.md Phase 1)

### ABSOLUTE RESTRICTIONS
> 🚫 Comportamientos absolutamente prohibidos — sin excepciones

- NUNCA generar un pipeline RAG sin reranker activo salvo `--reranker=none` + advertencia explícita en logs (anti-patrón "RAG sin reranking")
- NUNCA escribir el system prompt inline en el código — siempre en `prompts/rag-system.md` versionado en git
- NUNCA hardcodear API keys ni connection strings — solo `process.env.*`
- NUNCA omitir el filtro `tenant_id` / metadata en queries de retrieval (fuga de datos entre tenants)
- NUNCA reutilizar el cliente LLM con keys hardcodeadas — el generator consume la interfaz `LLMProvider` de `llm-integration`
- NUNCA sobreescribir archivos existentes del proyecto del usuario sin confirmación explícita

### REQUIRED OUTPUTS
> 📦 Archivos que DEBEN crearse al finalizar

- [ ] `src/rag/ingest.ts` — ingestion pipeline (parse → chunk → embed → upsert)
- [ ] `src/rag/retriever.ts` — hybrid search (semantic + keyword BM25, fusión RRF)
- [ ] `src/rag/reranker.ts` — cross-encoder reranker (default)
- [ ] `src/rag/generator.ts` — LLM generation con citations (consume `LLMProvider`)
- [ ] `src/rag/pipeline.ts` — orchestrator del pipeline completo
- [ ] `eval/golden-set/v1/cases.json` — 20 Q&A pairs de ejemplo para bootstrap
- [ ] `eval/golden-set/v1/metadata.json` — versión, fecha, cobertura de casos edge, `locked_until` (rotación semestral)
- [ ] `.github/workflows/rag-eval.yml` — CI que falla si `golden_set_score < threshold`
- [ ] `prompts/rag-system.md` — system prompt versionado en git
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0       Phase 1-2            Phase 3-4              Phase 5         Phase N+1
(Load)   →   (PIPELINE-SETUP)  →  (IMPLEMENTATION)   →  (EVAL-HARNESS) →  (Session)
            Stack + prereq        ingest/retrieve         golden set
            param config          rerank/generate         rag-eval.yml gate
```

---

## CASTLE ACTIVO: C·A·_·T·_·_

- **C (Contracts)**: El `generator.ts` reutiliza la interfaz `LLMProvider` de `llm-integration` (ADR-004). El pipeline expone un contrato estable `ingest()` / `query()`.
- **A (Architecture)**: Pipeline en etapas desacopladas `ingest → retrieve → rerank → generate`. Chunker y retriever agnósticos al LLM provider; generation server-side únicamente.
- **T (Testing)**: Gate `golden_set_score >= 0.85` ejecutado por el eval harness y bloqueante en CI (`rag-eval.yml`). Sin gate verde, el skill termina en `PARTIAL`.

---

## AGENTES INVOLUCRADOS

- **@developer** — Generación de código del pipeline, templates, actualización de `.env.example` y `package.json` scripts
- **@ml-engineer** — Validación de la arquitectura RAG, elección de chunker/embedding/reranker, diseño del golden set y de las métricas de eval

---

## Phase 0: Load Context (session-management)

### MUST DO
1. [ ] Cargar contexto AI de sesiones anteriores: `mem_context({ topic_key: 'ai_session', limit: 5 })`
2. [ ] `mem_search` sobre decisiones previas de vector DB / arquitectura RAG antes de proponer defaults
3. [ ] Cargar `.king/registry.md` — si invocado desde `/build` o `/ai-feature-scaffold`, heredar workflow context; si standalone, continuar sin asociación
4. [ ] Leer Knowledge Injection (ver REFERENCE.md → Knowledge Injection); si un archivo no existe: advertir y continuar

> Delegado a `skills/session-management/SKILL.md` → Phase 0

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: Este skill usa PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point compacto; los sub-archivos se cargan on-demand según la fase activa.
> Fases detalladas en [PHASES.md](PHASES.md).

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Stack Detection + Prerequisite Check | [PHASES.md](PHASES.md#phase-1-stack-detection--prerequisite-check) |
| Phase 2: Parameter Configuration | [PHASES.md](PHASES.md#phase-2-parameter-configuration) |
| Phase 3: Pipeline Code Generation (ingest / retriever / reranker) | [PHASES.md](PHASES.md#phase-3-pipeline-code-generation) |
| Phase 4: Generator + Orchestrator | [PHASES.md](PHASES.md#phase-4-generator--orchestrator) |
| Phase 5: Eval Harness + CI Gate | [PHASES.md](PHASES.md#phase-5-eval-harness--ci-gate) |

---

## FINAL CHECKPOINT

Antes de terminar, verificar que TODOS los REQUIRED OUTPUTS existen:

- [ ] `src/rag/ingest.ts` generado (parse → chunk → embed → upsert)
- [ ] `src/rag/retriever.ts` generado (hybrid semantic + BM25)
- [ ] `src/rag/reranker.ts` generado (cross-encoder, salvo `--reranker=none` con advertencia)
- [ ] `src/rag/generator.ts` generado (consume `LLMProvider`, citations)
- [ ] `src/rag/pipeline.ts` generado (orchestrator)
- [ ] `eval/golden-set/v1/cases.json` con exactamente 20 Q&A pairs + `metadata.json` con `locked_until`
- [ ] `.github/workflows/rag-eval.yml` generado con gate bloqueante `golden_set_score < threshold`
- [ ] `prompts/rag-system.md` generado (no hay prompt inline en el código)
- [ ] `npm run eval` reporta `golden_set_score >= 0.85` (o documentado como PARTIAL si no alcanza)
- [ ] Security gate pasado (sin keys/connection strings hardcodeados)
- [ ] Session document creado en `.king/sessions/`
- [ ] Resumen de archivos presentado al usuario con próximos pasos

---

## Execution Summary

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _lista de archivos del pipeline RAG generados, o "None"_ |
| Next Recommended | `/ai-safety` \| `/prompt-eval` \| `/build` |
| Risks | _golden_set_score bajo threshold, reranker=none, etc._ |

---

## Phase N+1: Write Session (session-management)

> Delegado a `skills/session-management/SKILL.md` → Phase N+1

### Engram first-class (OBLIGATORIO)
> Ver `knowledge/domain/engram-integration.md` §8

1. [ ] Persistir cada decisión de arquitectura RAG EN EL MOMENTO con `mem_save` (vector_db elegido, chunker, reranker), `scope: 'project'`, tags `['rag', 'architecture', ...]`
2. [ ] Registrar la aprobación de @ml-engineer en el AI Audit Ledger: `mem_save({ topic_key: 'ai_audit', tags: [agent_id, phase, feature] })`
3. [ ] Al cerrar el skill, llamar OBLIGATORIAMENTE:
   ```
   mem_session_summary({ include_decisions: true, include_costs: true })
   ```
4. [ ] Si Engram no está disponible: degradar a Chronicle con advertencia, NO romper el flujo

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Pipeline RAG generado, falta blindar el endpoint LLM (PII, prompt injection, OWASP LLM Top 10) | `/ai-safety` |
| Se quiere expandir el golden set o instrumentar evals de prompt fuera de RAG | `/prompt-eval` |
| Pipeline listo, se quieren construir features sobre el RAG (chatbot, search UI) | `/build` |
| Gate `golden_set_score` no alcanza 0.85 (Status PARTIAL) | Permanecer en `/rag-setup`: ajustar chunker/embedding/reranker o el system prompt y re-evaluar |

---

> 📚 Formatos de config, ejemplos de código TypeScript, schemas y el workflow `rag-eval.yml`: ver [REFERENCE.md](REFERENCE.md).
