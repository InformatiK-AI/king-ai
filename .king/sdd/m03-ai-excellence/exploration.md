# Exploration: M03 — AI Excellence Core

> La exploración detallada ya está hecha en el documento fuente `mejora/planes-detallados/M03-ai-excellence-core.md`. Esta nota registra los hallazgos del estado REAL del codebase (que difiere del doc en un punto) y las decisiones de orquestación.

## Estado real de king-ai (verificado en el worktree)

| Aspecto | Doc M03 dice | Realidad verificada |
|---------|--------------|---------------------|
| Skills existentes | "stub de 5 skills" / "2 skills operativos" | **3 skills** funcionales: `ai-feature-scaffold` (v2.0), `llm-integration` (v2.0), `session-management` + `_shared/` |
| Agente | `ml-engineer.md` sin contratos | Confirmado: `agents/ml-engineer.md`, sin `contracts/` |
| Knowledge | — | `knowledge/_inject/{llm-integration-essentials,ml-engineering-essentials}.md` + `knowledge/domain/{llm-patterns,ml-patterns}.md` |
| Commands | — | `commands/{ai-feature-scaffold,llm-integration}.md` |
| SDD | — | **No existía `.king/`** — este cambio lo inaugura |
| Hooks | — | **No existía `hooks/`** — lo crea M-13 |
| Rama | master desincronizada | `master` estaba 1 commit (fix BOM) adelante de `develop`; reconciliado vía `git merge --ff-only` antes del worktree |

**Conclusión**: NO hay 5 stubs que borrar. M03 EXTIENDE 3 skills existentes con 8 nuevos. `/llm-integration` v2.0 ya satisface el prerequisito duro — el trabajo `.ts` que el doc menciona NO es trabajo pendiente dentro de king-ai (los .ts los genera el skill en el proyecto del usuario).

## Naturaleza del plugin (decisión clave)

`king-ai` es un plugin **Markdown/YAML/bash** (como king-core M02, king-mobile M10). Implicaciones:
- `tdd.strict: false` — no hay test runner convencional.
- `/refactor` y `/optimize` **no aplican** (artefactos markdown). Chain de verificación: `["/review"]`.
- `/review` + `/fix` SÍ aplican (calidad de SKILL.md vs convención + gherkin coverage). El único artefacto bash real es `emit-span.sh`.

## Convención de skill confirmada

`skills/_shared/skill-anatomy.md` define la estructura King v2.0. Los skills grandes de king-ai usan **PHASE ROUTER** con sub-archivos (ej. `llm-integration` → `PROVIDER-SETUP.md` + `IMPLEMENTATION.md`; `ai-feature-scaffold` → `GENERATION.md`). El doc M03 pide `SKILL.md + PHASES.md + REFERENCE.md` por skill — compatible con PHASE ROUTER. Se sigue el checklist del doc (SKILL + PHASES + REFERENCE + command) para que `/sdd-verify` valide tarea por tarea.

## Decisiones de orquestación
- **Un cambio SDD paraguas** (no uno por sprint, pese a que §8 del doc lista varios `/sdd-new`). El "sprint" del doc = bloque de apply/merge interno (espejo de M10).
- **Modo SDD**: `/sdd-ff` — M03 ya está completamente especificado; re-explorar es redundante.
- **Worktree único** desde develop; **un merge final** (decisión del usuario, sobre el patrón incremental de M08/M10).
- **Scope-lock**: NEXUS impl y repo-template M-92 declarados `out_of_scope` en config para no bloquear verify/castle/archive.

## Ready for Proposal: Yes
