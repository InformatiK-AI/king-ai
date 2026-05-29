# Tasks: M03 — AI Excellence Core

> 52 tareas bite-sized (§6 del doc fuente), agrupadas por bloque de ejecución (apply+review+commit). Marcar `[x]` al completar. `/sdd-verify` valida tarea por tarea.

## Bloque B0 — Foundation (Track A knowledge + J-05)

- [x] A-01 `knowledge/domain/engram-integration.md` — APIs primarias, hooks SessionStart, fallback Chronicle, encrypted config
- [x] A-02 `knowledge/_inject/rag-patterns.md` — chunking, embedding models, retrieval modes, reranking, eval metrics
- [x] A-03 `knowledge/_inject/ai-safety-patterns.md` — OWASP LLM Top 10, prompt injection, PII regex/Presidio, jailbreak taxonomy
- [x] A-04 `knowledge/domain/llm-evals.md` — Ragas, TruLens, golden sets, LLM-as-judge, regression detection, CI
- [x] A-05 `knowledge/domain/nexus-cross-project.md` — schema SQL NEXUS, confidence scoring, flujo, precondición sqlite-vec (esqueleto; se finaliza en B5)
- [x] A-06 `knowledge/domain/ai-agent-starter-pro-spec.md` — stack, features, criterios de activación, setup ≤5 pasos (esqueleto; se finaliza en B5)
- [x] J-05 `agents/ml-engineer.md` — sección "AI Features del Producto" + §9 Knowledge Base con 5 knowledge nuevos

## Bloque B1 — Core (Tracks B, C, D)

### /rag-setup (Track B)
- [x] B-01 `skills/rag-setup/SKILL.md` — QUICK REFERENCE, blocking conditions, absolute restrictions, required outputs
- [x] B-02 `skills/rag-setup/PHASES.md` — detección vector DB, generación ingest/retriever/reranker
- [x] B-03 `skills/rag-setup/REFERENCE.md` — ejemplos TS, golden-set.json, eval-runner.ts, CI workflow
- [x] B-04 `commands/rag-setup.md` — invocación, parámetros, outputs, ejemplos
- [x] B-05 GitHub Actions `rag-eval.yml` de ejemplo (incluido en REFERENCE.md)

### /ai-safety (Track C)
- [x] C-01 `skills/ai-safety/SKILL.md` — blocking conditions (pii_leak_rate gate), restrictions, required outputs
- [x] C-02 `skills/ai-safety/PHASES.md` — análisis endpoints LLM, generación prompt-guard/pii-redactor/content-moderator
- [x] C-03 `skills/ai-safety/REFERENCE.md` — adversarial-prompts.json (20 casos OWASP), safety-config.yaml
- [x] C-04 `commands/ai-safety.md`

### /prompt-eval (Track D)
- [x] D-01 `skills/prompt-eval/SKILL.md` — blocking conditions, CI integration, required outputs
- [x] D-02 `skills/prompt-eval/PHASES.md` — detección prompts, generación eval harness, integración CI
- [x] D-03 `skills/prompt-eval/REFERENCE.md` — eval.config.yaml, cases.json, CI workflow, regression detection
- [x] D-04 `commands/prompt-eval.md`

## Bloque B2 — Cost+Obs (Tracks E, F)

### /ai-cost-gate (Track E)
- [x] E-01 `skills/ai-cost-gate/SKILL.md` — blocking conditions, circuit breaker required, required outputs
- [x] E-02 `skills/ai-cost-gate/PHASES.md` — detección integraciones LLM, generación budget-enforcer/quota-tracker/circuit-breaker
- [x] E-03 `skills/ai-cost-gate/REFERENCE.md` — cost-gate.config.yaml, model-router.ts, Redis/Upstash setup
- [x] E-04 `commands/ai-cost-gate.md`

### /ai-observability (Track F)
- [x] F-01 `skills/ai-observability/SKILL.md` — OTel GenAI semconv, tracing 100% gate, required outputs
- [x] F-02 `skills/ai-observability/PHASES.md` — prerequisito OTel, generación otel-llm-tracer/prompt-registry/metrics-exporter
- [x] F-03 `skills/ai-observability/REFERENCE.md` — tabla spans OTel, Langfuse vs Helicone, Prometheus metrics, .env.example
- [x] F-04 `commands/ai-observability.md`

## Bloque B3 — Audit+Report (Track G → H)

### /ai-audit-ledger (Track G)
- [x] G-01 `skills/ai-audit-ledger/SKILL.md` — diferenciación de king-core audit, scope AI actions, required outputs
- [x] G-02 `skills/ai-audit-ledger/PHASES.md` — lectura JSONL ledger, generación reportes, filtros agente/fase/feature
- [x] G-03 `skills/ai-audit-ledger/REFERENCE.md` — schema JSONL, patologías (señales+acciones), formato export CSV
- [x] G-04 `hooks/ai-audit/emit-span.sh` — script bash que escribe entrada JSONL al ledger (+ `hooks/hooks.json`)
- [x] G-05 `commands/ai-audit-ledger.md` — flags `--agent --phase --feature --export --pathologies`

### /cost-report (Track H) — depende de G
- [x] H-01 `skills/cost-report/SKILL.md` — dependencia del ledger, predictive cost algorithm, required outputs
- [x] H-02 `skills/cost-report/PHASES.md` — lectura ledger, cálculo métricas, predictive cost, generación reportes
- [x] H-03 `skills/cost-report/REFERENCE.md` — formato secciones, FinOps export JSON schema, sparkline ASCII
- [x] H-04 `commands/cost-report.md`

## Bloque B4 — Adversarial+Contratos (Tracks I, J-01..J-04)

### judgment-day (Track I)
- [x] I-01 `skills/judgment-day/SKILL.md` — protocolo 3 jueces, condiciones tiebreaker, modos de uso
- [x] I-02 `skills/judgment-day/PHASES.md` — Phase 1 judges paralelos, Phase 2 comparar, Phase 3 tiebreaker condicional
- [x] I-03 `skills/judgment-day/REFERENCE.md` — output format 3 secciones, ejemplos de cada veredicto

### Contratos @ml-engineer (Track J)
- [x] J-01 `agents/contracts/ml-engineer-security.md` — safety gates, cuándo `--adversarial` obligatorio, PII en contexto
- [x] J-02 `agents/contracts/ml-engineer-performance.md` — cost/latency tradeoffs, model routing, prompt caching, token budgets
- [x] J-03 `agents/contracts/ml-engineer-qa.md` — eval harness handoff, golden set formato, regression detection, threshold gates
- [x] J-04 `agents/contracts/ml-engineer-developer.md` — interfaz LLM (input/output schema, fallback, error codes, streaming)

## Bloque B5 — Cierre (finalización + plugin.json)

- [x] B5-01 Verificar los 5 M-87 (B,C,D,E,F) en DONE → finalizar A-06 con tabla de features y criterios de activación
- [x] B5-02 Finalizar A-05 (NEXUS schema completo + nota de dependencia sqlite-vec)
- [x] B5-03 `.claude-plugin/plugin.json` — version bump + keywords (rag, ai-safety, prompt-eval, cost-gate, observability, audit-ledger)
- [x] B5-04 Verificar Engram Phase N+1 (`mem_session_summary`) presente en los 8 SKILL.md nuevos

## Verificación (Bloque final, fuera de apply)
- [ ] V-01 `/qa-batch` global sobre los skills nuevos
- [ ] V-02 `/sdd-verify` → verify-report.md (52/52, gherkin coverage, out_of_scope respetado)
- [ ] V-03 `/castle` → verdict (esperado FORTIFIED)
- [ ] V-04 `/review --adversarial` final (dogfooding judgment-day)
