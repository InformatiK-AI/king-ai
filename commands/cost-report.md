---
name: cost-report
description: "Leer el AI Audit Ledger (.king/audit/*.jsonl) y producir reportes de cost attribution: top 5 features por costo, trend mensual por agente (sparkline ASCII), cost per merged PR, predictive cost (>= 5 builds) y anomalías (>3x el promedio de su categoría). Exporta a FinOps JSON (Vantage/Cloudability/FOCUS) y CSV."
argument-hint: "[--period YYYY-MM] [--from <fecha> --to <fecha>] [--agent <id>] [--phase plan|build|qa|review] [--feature <id>] [--predict] [--export finops] [--cost-center <nombre>]"
allowed-tools: [Read, Write, Glob, Grep, Bash, Agent]
---

# /cost-report

Ejecutar el skill de AI Cost Attribution Report.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:cost-report`
2. Argumentos opcionales (ver tabla de Parámetros)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1 (READ LEDGER, PHASES.md) → Phase 2-3 (AGGREGATE + PREDICT + ANOMALIES, PHASES.md) → Phase 4 (RENDER + EXPORT, PHASES.md) → Phase N+1 (Session)
4. Agentes: @ml-engineer (primario — valida `tokens_estimated → cost_usd`, el algoritmo de predictive cost y los umbrales de anomalía), @developer (correlación plan→merge para cost per PR, escritura de artefactos, CSV importable), @security (ningún reporte ni export filtra PII)

## Parámetros

| Parámetro | Valores | Default | Efecto |
|-----------|---------|---------|--------|
| `--period` | `YYYY-MM` | día actual | Agrega todos los días del mes |
| `--from` / `--to` | fecha ISO | — | Rango explícito de fechas (alternativa a `--period`) |
| `--agent` | id de agente | todos | Filtra el ledger por `agent_id` antes de agregar |
| `--phase` | `plan` \| `build` \| `qa` \| `review` | todas | Filtra por fase SDD |
| `--feature` | id de feature | todos | Filtra por `feature` |
| `--predict` | flag | off | Fuerza la sección Predictive Cost (sujeta al gate de >= 5 builds) |
| `--export` | `finops` | off | Genera el `finops-export.json` (aborta si el período está vacío) |
| `--cost-center` | nombre | `engineering` | Sobrescribe el `cost_center` del export FinOps |

## Outputs

Genera en `.king/reports/cost/`:

- `YYYY-MM-DD-cost-report.md` — reporte human-readable con las 5 secciones: top 5 features, trend mensual por agente (sparkline ASCII), cost per merged PR, predictive cost, anomalías
- `YYYY-MM-DD-finops-export.json` — export FinOps compatible Vantage/Cloudability/FOCUS (`provider`, `service`, `cost_center`, `tags`, `usage`, `cost_usd`, `period`)
- `YYYY-MM-DD-cost-report.csv` — export para hojas de cálculo (UTF-8 sin BOM, header obligatorio)

El skill es **READ-ONLY** sobre `.king/audit/*.jsonl` — nunca escribe en el ledger.

## Dependencia — lee el AI Audit Ledger

`/cost-report` es el **consumidor analítico** del ledger producido por `/ai-audit-ledger` (que `/ai-cost-gate` y `/ai-observability` también alimentan). Lee el NDJSON `king.ai_audit.v1` de `.king/audit/YYYY-MM-DD.jsonl` con el MISMO schema del productor — coherencia obligatoria. Si el ledger está vacío para el período: no hay datos que reportar (abortar con aviso).

## Gates / comportamiento de bloqueo

- **Predictive cost** solo con `>= 5 builds` históricos. Con menos, el reporte indica `"Insuficiente historial (<N> builds) para predicción confiable — mínimo 5"` y NO muestra estimación (nunca un número inventado).
- **Export FinOps** aborta si el período está vacío (`"No hay entradas para el período <X>"`); el JSON debe validar contra el FinOps Open Cost and Usage Spec o no se escribe.
- **Anomalías** = `> 3x el promedio de su categoría`; una categoría con < 2 muestras no produce anomalía (sin baseline confiable).

## Ejemplos

```bash
# Reporte del día actual (3 artefactos en .king/reports/cost/)
/cost-report

# Reporte mensual con predictive cost
/cost-report --period 2026-05 --predict

# Export FinOps del mes para importar en Vantage/Cloudability
/cost-report --export finops --period 2026-05

# Costo atribuido a un agente y feature concretos
/cost-report --agent ml-engineer --feature auth --period 2026-05

# Export FinOps con cost_center custom
/cost-report --export finops --period 2026-05 --cost-center ai-platform
```

## Notas

- Si el ledger está vacío para el período, recomendar ejecutar acciones AI o `/ai-audit-ledger` primero — no hay datos que reportar.
- Tras detectar anomalías o features caras, el flujo sugerido es `/ai-cost-gate` para imponer budget/circuit breaker sobre esas features.
- El histórico de builds que alimenta el predictive cost vive en Engram (`topic_key: ai_audit`); cada ejecución persiste el costo del período como build histórico, mejorando el baseline de futuras predicciones.
- Las tres vistas (`.md`, `.json`, `.csv`) son el mismo dato: la suma de `cost_usd` debe cuadrar entre las tres.
