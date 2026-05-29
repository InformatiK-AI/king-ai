---
name: rag-setup
description: "Generar un RAG pipeline de producción (ingest → retrieve → rerank → generate) con vector DB, eval harness y CI gate en el proyecto del usuario"
argument-hint: "[--vector-db pgvector|pinecone|weaviate|chroma] [--embedding-model <model>] [--chunker recursive|semantic|sliding_window] [--reranker cross-encoder|cohere|none] [--eval-framework ragas|trulens|custom]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /rag-setup

Ejecutar el skill de RAG setup.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:rag-setup`
2. Argumentos opcionales:
   - `--vector-db pgvector|pinecone|weaviate|chroma`: vector DB (default: `pgvector`)
   - `--embedding-model <model>`: modelo de embeddings (default: `text-embedding-3-small`)
   - `--chunker recursive|semantic|sliding_window`: estrategia de chunking (default: `recursive`)
   - `--reranker cross-encoder|cohere|none`: reranker (default: `cross-encoder`; `none` exige advertencia)
   - `--eval-framework ragas|trulens|custom`: framework de eval (default: `ragas`)
   - `--threshold <0..1>`: gate `golden_set_score` (default: `0.85`)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (PHASES.md: stack + prerequisito + parámetros) → Phase 3-4 (PHASES.md: pipeline + generator) → Phase 5 (PHASES.md: eval harness + CI gate) → Phase N+1 (Session)
4. Agentes: @developer (primario), @ml-engineer (validación de arquitectura y golden set)

## Prerequisito (BLOCKING)

`/rag-setup` requiere `/llm-integration` ejecutado previamente — el generator reutiliza la interfaz `LLMProvider`. Si NO se detecta `llm-integration` en el proyecto, el skill se detiene SIN generar ningún archivo:

```
llm-integration es prerequisito de /rag-setup — ejecutar primero /llm-integration
```

## Outputs

- `src/rag/{ingest,retriever,reranker,generator,pipeline}.ts`
- `eval/golden-set/v1/cases.json` (20 Q&A) + `metadata.json` + `rotation-schedule.md`
- `eval/ci-eval.ts` (+ runner según framework)
- `.github/workflows/rag-eval.yml` (CI gate bloqueante: falla si `golden_set_score < threshold`)
- `prompts/rag-system.md` (system prompt versionado)
- `.king/quality-gates.yaml` actualizado con `ai.eval.golden_set_score`
- (solo pgvector) `src/db/migrations/create_rag_embeddings.sql`

## Ejemplos

```
/rag-setup
/rag-setup --vector-db=pgvector --reranker=cross-encoder
/rag-setup --vector-db=pinecone --embedding-model=text-embedding-3-large --eval-framework=custom
/rag-setup --reranker=none          # genera advertencia explícita (anti-patrón RAG sin reranking)
```

Si no se detecta `package.json` en el proyecto, advertir al usuario que se requiere un proyecto existente.
Tras generar el pipeline, sugerir `/ai-safety` para blindar el endpoint LLM (PII, prompt injection, OWASP LLM Top 10).
