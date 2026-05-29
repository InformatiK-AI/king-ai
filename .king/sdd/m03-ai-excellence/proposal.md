# Proposal: M03 — AI Excellence Core

> Fuente canónica: `mejora/planes-detallados/M03-ai-excellence-core.md`
> Plugin destino: `king-ai` (extender el stub existente — NO crear plugin nuevo)
> Prioridad: P1 — posiciona King como referente AI-native; M14 depende de este módulo para `ai-agent-starter-pro`.

## Intent

Convertir `king-ai` (hoy stub: `ai-feature-scaffold` + `llm-integration` v2.0 + agente `ml-engineer` sin contratos) en un **stack AI-native completo**. King se autodenomina "AI-native framework" pero hoy no puede: generar RAG sobre datos propios, detectar prompt injection en producción, medir el costo de AI por feature, ni compartir patterns validados entre proyectos. Esto es vaporware de posicionamiento hasta que M03 exista.

## Scope

### In Scope
- **M-87** — 5 skills: `/rag-setup`, `/ai-safety`, `/prompt-eval`, `/ai-cost-gate`, `/ai-observability` (cada uno SKILL.md + PHASES.md + REFERENCE.md + command).
- **M-13** — `/ai-audit-ledger` (audita acciones del AI: tokens/agentes/fases/vetos/patologías) + hook `emit-span.sh`.
- **M-23** — `/cost-report` (cost attribution, lee el ledger; predictive cost; export FinOps).
- **M-18** — Engram first-class: knowledge `engram-integration.md` + pattern obligatorio en todos los skills king-ai.
- **M-20** — judgment-day (`/review --adversarial`): 2 jueces ciegos + tiebreaker Opus.
- **6 knowledge files**: engram-integration, rag-patterns, ai-safety-patterns, llm-evals, nexus-cross-project (schema), ai-agent-starter-pro-spec.
- **@ml-engineer**: 4 contratos bilaterales (security, performance, qa, developer) + sección "AI Features del Producto" + §9 Knowledge Base actualizada.

### Out of Scope
- **Implementación activa de NEXUS (M-22, P2)** — depende de Engram sqlite-vec (externo). Se entrega solo schema SQL + knowledge file.
- **Repositorio `ai-agent-starter-pro` (M-92)** — se entrega solo la SPEC (knowledge). El repo se genera cuando los 5 M-87 estén DONE verificados.
- **Código `.ts`** — los artefactos TypeScript del doc son lo que los skills GENERAN en el proyecto del usuario, no código a implementar dentro de king-ai.

## Capabilities

### New Capabilities
| Capability | Artefacto | Track |
|------------|-----------|-------|
| `rag-setup` | skill + command | B |
| `ai-safety` | skill + command | C |
| `prompt-eval` | skill + command | D |
| `ai-cost-gate` | skill + command | E |
| `ai-observability` | skill + command | F |
| `ai-audit-ledger` | skill + command + hook | G |
| `cost-report` | skill + command | H |
| `judgment-day` | skill | I |
| `ml-engineer-contracts` | 4 contratos bilaterales | J |
| `ai-knowledge-base` | 6 knowledge files | A |

### Modified Capabilities
| Capability | Cambio |
|------------|--------|
| `ml-engineer` (agente) | + sección "AI Features del Producto"; §9 referencia 5 knowledge nuevos |
| `plugin.json` | version bump + keywords AI-native |

## Approach
Un solo cambio SDD paraguas. `/sdd-apply` por bloque (B0–B5) para no saturar contexto. Commits incrementales en `feature/m03-ai-excellence`. `/review` + `/fix` por bloque. **UN solo `/merge` a develop al final** (decisión del usuario). `/refactor` y `/optimize` no aplican (markdown).

## Affected Areas
| Área | Acción |
|------|--------|
| `king-ai/skills/` | +8 skills nuevos |
| `king-ai/commands/` | +7 commands |
| `king-ai/knowledge/{_inject,domain}/` | +6 knowledge files |
| `king-ai/agents/` | editar `ml-engineer.md`; +`contracts/` (4 archivos) |
| `king-ai/hooks/` | +`ai-audit/emit-span.sh` + `hooks.json` |
| `king-ai/.claude-plugin/plugin.json` | version + keywords |

## Risks
Ver §3 del doc fuente. Principales: PII leakage en RAG (mitigado por `/ai-safety` gate `pii_leak_rate: 0`), cost runaway (`/ai-cost-gate` circuit breaker), rama feature divergente por merge único (asumido por el usuario), scope creep en `/ai-safety` (v1 acotado: prompt injection + PII + moderation).

## Rollback Plan
Toda la entrega vive en `feature/m03-ai-excellence`. Si el merge único falla los quality gates, la rama se descarta sin tocar develop. El worktree es removible (`git worktree remove`).

## Dependencies
- `/llm-integration` (king-ai) — prerequisito de runtime de `/rag-setup` y `/ai-safety`. **Satisfecho** (v2.0 shipped).
- Engram sqlite-vec — hard para M-22 (NEXUS), diferido.
- M02 Jarvis phase-awareness — soft para M-13/M-23 (granularidad de atribución).

## Success Criteria
- 8 skills nuevos + 6 knowledge + 4 contratos + hook, todos siguiendo King v2.0 (`skill-anatomy.md`).
- Cada skill mapea sus escenarios Gherkin (§7 del doc) a blocking_conditions/required_outputs.
- `/sdd-verify` PASS con `out_of_scope` respetado; `/castle` FORTIFIED (o CONDITIONAL documentado).
- Un único squash merge a develop; cambio archivado.
