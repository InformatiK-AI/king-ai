---
name: ai-audit-ledger
description: "Auditar las ACCIONES DEL AI del proyecto: tokens, agentes, fases, vetos, costos y patologías de comportamiento (loop, runaway agent, role drift, cost spike). Lee el ledger NDJSON en .king/audit/ y produce reportes de token attribution, cost por agente, veto-rate por fase y pathology report. Exporta a CSV para compliance. NO audita la salud del framework (eso es king-core/audit)."
argument-hint: "[--agent <id>] [--phase plan|build|qa|review] [--feature <id>] [--export csv] [--pathologies] [--period YYYY-MM]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /ai-audit-ledger

Ejecutar el skill del AI Audit Ledger.

## Diferenciación

Este comando audita **lo que el AI hizo** (acciones de agentes: tokens, fases, vetos, costos, patologías). NO audita la salud del framework — para eso está `king-core /audit` (LOAD-INDEX, cross-references, Health Score). Son concerns ortogonales: uno mira lo que los agentes hicieron, el otro mira si el framework está bien instalado.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:ai-audit-ledger`
2. Argumentos opcionales: ver tabla de Parámetros
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1 (HOOK SETUP, PHASES.md) → Phase 2-3 (INGEST + PATHOLOGY SCAN, PHASES.md) → Phase 4 (REPORTS + EXPORT, PHASES.md) → Phase N+1 (Session)
4. Agentes: @ml-engineer (primario — lógica de patologías loop/runaway/cost spike, emite veto, valida atribución de costo), @security (role drift + verifica que el ledger no contenga PII), @developer (registro del hook, formato CSV)

## Parámetros

| Parámetro | Valores | Default | Efecto |
|-----------|---------|---------|--------|
| `--agent` | id de agente | todos | Filtra el ledger por `agent_id` (ej. `--agent ml-engineer`) |
| `--phase` | `plan` \| `build` \| `qa` \| `review` | todas | Filtra por fase SDD |
| `--feature` | id de feature | todas | Filtra por `feature` (ej. `--feature auth`) |
| `--export` | `csv` | off | Genera `<period>-cost-attribution.csv` para compliance |
| `--pathologies` | flag | off | El `pathology-report.md` es el output principal (corre el scan de patologías) |
| `--period` | `YYYY-MM` | día actual | Agrega todos los días del mes |

## Outputs

Productos del skill (sobre el ledger NDJSON `.king/audit/YYYY-MM-DD.jsonl`, append-only e inmutable):

- `.king/audit/reports/tokens-by-feature.md` — tokens agregados por feature
- `.king/audit/reports/cost-attribution-by-agent.md` — costo USD estimado por agente
- `.king/audit/reports/veto-rate-by-phase.md` — veto-rate por fase SDD
- `.king/audit/reports/pathology-report.md` — patologías detectadas con evidencia
- `.king/audit/reports/<period>-cost-attribution.csv` — export para compliance (si `--export csv`)
- Acciones persistidas en Engram (`topic_key: ai_audit`, tags `[agent_id, phase, feature]`)

## Hooks instalados

- `PostToolUse otel-trace-emit` → `bash "${CLAUDE_PLUGIN_ROOT}/hooks/ai-audit/emit-span.sh"` — emite un span NDJSON por cada acción AI (async, nunca bloquea el tool).
- `Stop session-summary-force` — si el agente no llamó `mem_session_summary`, fuerza el cierre con resumen de acciones y costos antes de terminar.

## Patologías detectadas

| Patología | Señal | Umbral | Acción |
|-----------|-------|--------|--------|
| Loop detection | mismo tool + mismo input_hash repetido | > 5 veces en 2 min | Veto + alerta |
| Runaway agent | costo vs estimado sin progreso | cost > 3x estimado | Pausa + escalación |
| Role drift | acción fuera del scope declarado del agente | cualquier acción fuera de scope | Warning + log |
| Cost spike | costo de sesión vs media histórica del agente | costo sesión > 2x media | Alerta FinOps |

## Gates de bloqueo

- Sin el hook `emit-span.sh` registrado en `hooks/hooks.json`, el ledger está ciego — el skill lo instala/registra en Phase 1 antes de generar reportes.
- `--export csv` con el período vacío **aborta** el export (no genera CSV vacío). El CSV es UTF-8 sin BOM, importable en Excel/Sheets.
- El ledger es **append-only e inmutable**: ninguna línea existente se reescribe; las patologías se anexan como eventos nuevos.

## Ejemplos

```bash
# Acciones de un agente específico
/ai-audit-ledger --agent ml-engineer

# Acciones en una fase SDD
/ai-audit-ledger --phase build

# Acciones en un feature
/ai-audit-ledger --feature auth

# Export para compliance del mes de mayo
/ai-audit-ledger --export csv --period 2026-05

# Solo el reporte de patologías detectadas
/ai-audit-ledger --pathologies
```

## Notas

- Si `.king/audit/` está vacío, el skill instala el hook y crea el directorio: los reportes quedan vacíos hasta que haya acciones registradas (degradación grácil, no aborta — salvo `--export csv`).
- El ledger NO contiene PII (`prompt_text`/`response_text`/`user_ip`): solo metadata de acción (agente, tool, tokens, costo, fase, feature, resultado, hash).
- `/cost-report` (M-23) consume este ledger para análisis de cost attribution profundo. `/ai-cost-gate` y `/ai-observability` lo alimentan con eventos de quota/breaker/spans OTel.
