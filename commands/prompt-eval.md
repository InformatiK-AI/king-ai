---
name: prompt-eval
description: "Generar suite de evals de prompts (golden set + LLM-as-judge + regression) con threshold gate bloqueante en CI"
argument-hint: "[--golden-set-version v1] [--judge-model <model>] [--with-rag]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /prompt-eval

Ejecutar el skill de prompt eval: genera el eval harness (golden set versionado, runners de métricas, LLM-as-judge y regression detector) cableado a un workflow de CI con threshold gate bloqueante.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:prompt-eval`
2. Argumentos opcionales:
   - `--golden-set-version <vN>`: versión del golden set a crear/extender (default: `v1`). Version lock: una versión publicada es inmutable.
   - `--judge-model <model>`: modelo del LLM-as-judge (default: `claude-haiku-4-5` — económico para evals masivas).
   - `--with-rag`: forzar la extensión del harness con métricas RAG (`faithfulness` + `answer_relevance`). Si se omite, se autodetecta en Phase 1.
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (PHASES.md: stack + golden set + eval.config.yaml) → Phase 3-4 (PHASES.md: runners + CI gate + extensión RAG) → Phase N+1 (Session)
4. Agente: @ml-engineer (diseño del golden set, métricas por dominio, rúbrica del juez, validación del gate).

## Outputs

- `eval/golden-set/v1/{cases.json, metadata.json}` — golden set versionado (≥10 casos)
- `eval/runners/{golden-set-runner, llm-judge, regression-detector}.ts` — runners de métricas
- `eval/reports/.gitkeep` — placeholder; los reportes se generan en CI
- `eval/eval.config.yaml` — thresholds, `judge_model`, `baseline_strategy`, weights
- `.github/workflows/prompt-eval.yml` — gate bloqueante en `push: main` + `pull_request`
- Scripts `npm run eval*` en `package.json`

## Ejemplos

```
/prompt-eval
/prompt-eval --judge-model claude-haiku-4-5
/prompt-eval --golden-set-version v2 --with-rag
```

## Notas

- BLOCKING: requiere casos de uso documentados (`.king/knowledge/`, docs o input del usuario) para derivar ≥10 casos. Sin material suficiente, el skill se detiene y pide ejemplos.
- El threshold gate es bloqueante: cualquier step de CI con `exit != 0` bloquea el merge.
- Defaults canónicos: `judge_model: claude-haiku-4-5`, `baseline_strategy: last_green_ci`, `regression_max_drop: 0.05`.
- Si el proyecto tiene RAG (`/rag-setup`), el harness se extiende con `faithfulness` y `answer_relevance`; no se reemplaza.
- Tras crear el harness, sugerir `/rag-setup` (si aplica), `/ai-cost-gate` o `/build`.
