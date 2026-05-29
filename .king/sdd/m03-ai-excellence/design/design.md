# Design: M03 — AI Excellence Core (king-ai)

> Diseño técnico por skill: ver §2 del doc fuente (`mejora/planes-detallados/M03-ai-excellence-core.md`). Este documento añade las decisiones de orquestación y convención que el doc no fija.

## Technical Approach
M03 entrega artefactos **Markdown/YAML/bash** dentro de `king-ai`. Cada skill es documentación que INSTRUYE cómo generar artefactos `.ts` en el proyecto del usuario (no se implementa TypeScript en king-ai). El diseño funcional de cada skill (inputs, artefactos generados, gates, formatos de config) está completamente especificado en §2 del doc fuente y se transcribe a los SKILL/PHASES/REFERENCE.

## Architecture Decisions

### Decision: Un cambio SDD paraguas con apply por bloque
- **Choice**: Un solo `m03-ai-excellence` con `tasks/checklist.md` por tracks; `/sdd-apply` invocado por bloque (B0–B5).
- **Alternatives**: Un cambio SDD por sprint (como sugiere literal §8 del doc).
- **Rationale**: Los 11 artefactos comparten 80% del diseño (todos siguen `skill-anatomy.md`, inyectan knowledge, tienen Engram Phase N+1). Multiplicar proposal/design es sobrecarga. Espejo del patrón M10 (un cambio, 7 sprints de entrega).

### Decision: Merge único final (no incremental)
- **Choice**: Un worktree desde develop, commits incrementales por bloque, **un solo `/merge` a develop** al cierre.
- **Alternatives**: Merge incremental por bloque (patrón M08/M10).
- **Rationale**: Decisión explícita del usuario. Tradeoff aceptado: rama feature divergente durante la corrida. Mitigación: pre-flight `ff` alineó develop; ningún otro plugin toca king-ai.

### Decision: PHASE ROUTER por skill (SKILL + PHASES + REFERENCE)
- **Choice**: Cada skill = `SKILL.md` (entry point: QUICK REFERENCE + CASTLE + Phase 0 + router + FINAL CHECKPOINT + Phase N+1/N+2) → `PHASES.md` (fases detalladas) → `REFERENCE.md` (formatos, código de ejemplo).
- **Rationale**: Compatible con `skill-anatomy.md` y con el patrón real de `llm-integration` (PHASE ROUTER). Coincide con el checklist del doc para que `/sdd-verify` valide tarea por tarea.

### Decision: `/refactor` y `/optimize` excluidos del chain de verificación
- **Choice**: `chain: ["/review"]` en config.yaml.
- **Rationale**: Artefactos markdown — no hay deuda algorítmica ni Big O que optimizar. Espejo de M02.

### Decision: Scope-lock de NEXUS y template repo
- **Choice**: `out_of_scope: [impl-NEXUS-M22, repo-template-M92]` en config.
- **Rationale**: NEXUS requiere sqlite-vec externo; M-92 repo requiere los 5 M-87 DONE. Sin el scope-lock, `/sdd-verify` y `/castle` los marcarían incompletos y bloquearían el archive. Se entregan solo schema/knowledge/spec.

## Data Flow — dependencias entre tracks
```
A (knowledge) ──prerequisito──> B,C,D,E,F,G,H,I  (los skills inyectan knowledge)
                                G ──ledger──> H  (cost-report lee el ledger de audit-ledger)
                                G ──soft──> I    (judgment-day emite eventos al ledger)
J-05 (editar ml-engineer.md) ── en B0 (único editor del archivo)
J-01..J-04 (crear contratos) ── en B4 (solo CREAN archivos nuevos, sin tocar §9)
B,C,D,E,F (5 M-87 DONE) ──gate──> M-92 spec (A-06 finaliza en B5)
```

## File Changes (resumen — detalle en tasks/checklist.md)
| File/Dir | Action | Bloque |
|----------|--------|--------|
| `knowledge/domain/{engram-integration,llm-evals,nexus-cross-project,ai-agent-starter-pro-spec}.md` | create | B0/B5 |
| `knowledge/_inject/{rag-patterns,ai-safety-patterns}.md` | create | B0 |
| `agents/ml-engineer.md` | modify (§ AI Features + §9) | B0 |
| `skills/{rag-setup,ai-safety,prompt-eval}/` | create (SKILL+PHASES+REFERENCE) | B1 |
| `skills/{ai-cost-gate,ai-observability}/` | create | B2 |
| `skills/{ai-audit-ledger,cost-report}/` + `hooks/ai-audit/emit-span.sh` + `hooks/hooks.json` | create | B3 |
| `skills/judgment-day/` + `agents/contracts/ml-engineer-{security,performance,qa,developer}.md` | create | B4 |
| `commands/{rag-setup,ai-safety,prompt-eval,ai-cost-gate,ai-observability,ai-audit-ledger,cost-report}.md` | create | B1–B3 |
| `.claude-plugin/plugin.json` | modify (version + keywords) | B5 |

## Interfaces / Contracts
- **emit-span.sh** (hook bash): recibe env `AGENT_ID, TOOL_NAME, DURATION_MS, TOKEN_COST_ESTIMATED, RESULT_STATUS, SDD_PHASE`; escribe una línea NDJSON en `.king/audit/YYYY-MM-DD.jsonl`. Único artefacto bash ejecutable real del módulo.
- **4 contratos bilaterales**: siguen el patrón de `king-mobile/agents/.../contracts/` (formato bilateral con responsabilidades de cada lado).

## Testing Strategy
| Layer | What | Approach |
|-------|------|----------|
| Convención | SKILL.md vs `skill-anatomy.md` | `/review` por bloque |
| Gherkin coverage | cada scenario §7 → blocking_condition/required_output | `/review` + `/sdd-verify` |
| Hook bash | `emit-span.sh` produce JSONL válido | ejecutar el script con env de prueba |
| Coherencia knowledge↔skill | cada skill referencia su knowledge en Knowledge Injection | `/qa-batch` |

No hay tests TS dentro de king-ai (los tests del §4 del doc son para el código que los skills generan en el proyecto del usuario).

## Migration / Rollout
Bloques B0→B5 en la rama feature; verify → castle → un merge → archive. `master` queda atrás hasta el próximo `/release` (GitFlow normal).

## Open Questions
- [ ] Ubicación de contratos: `king-ai/agents/contracts/` (elegida) vs `_common/contracts/`. → Se usa `king-ai/agents/contracts/` (autocontenido en el plugin).
