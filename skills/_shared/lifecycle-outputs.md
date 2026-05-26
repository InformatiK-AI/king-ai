# Lifecycle Skill Outputs (shared convention)

> **Fuente canónica** de rutas de output para todos los skills del ciclo de vida.
> Los SKILL.md referencian este archivo en lugar de hardcodear paths.
>
> Análogo a `chronicle-convention.md` para SDD skills.

---

## Convención de Naming — Session Documents

```
.king/sessions/YYYY-MM-DD_NNNN_skill-name_context.md
```

| Componente | Descripción | Ejemplo |
|------------|-------------|---------|
| `YYYY-MM-DD` | Fecha de ejecución ISO | `2026-03-26` |
| `NNNN` | Secuencial global del día (0001, 0002...) | `0003` |
| `skill-name` | Nombre del skill ejecutado | `build`, `merge`, `qa` |
| `_context` | Slug del workflow activo o branch (max 40 chars, kebab-case) | `auth-middleware`, `fix-login-bug` |

- Skills **standalone** (sin workflow): omitir `_context` → `YYYY-MM-DD_NNNN_skill-name.md`
- El `context` se obtiene del nombre del workflow activo en `.king/workflows/[nombre]/context.md`
- Referencia completa: `knowledge/session-tracking.md`

**Algoritmo de cómputo del siguiente NNNN**:
1. Listar `.king/sessions/YYYY-MM-DD_*.md` (fecha de hoy)
2. Extraer el segmento numérico entre el primer y segundo `_` de cada filename
3. Parsear cada segmento como entero base-10 (retrocompatible: `003` → 3, `0012` → 12)
4. Tomar el máximo; default 0 si el directorio no tiene archivos del día
5. Siguiente = max + 1, formateado con `printf "%04d"` (zero-padding a 4 dígitos)

> **Nota de transición**: El directorio `.king/sessions/` puede contener archivos NNN (3 dígitos,
> pre-v1.4) y NNNN (4 dígitos, v1.4+) coexistiendo. Esto es esperado y el algoritmo lo maneja
> correctamente mediante parseo como entero. NO renombrar archivos NNN existentes.
> Edge case: si el secuencial alcanza 9999, emitir error visible al usuario y no continuar.

**Ejemplos:**
```
.king/sessions/2026-03-26_0001_build_auth-middleware.md
.king/sessions/2026-03-26_0002_qa_auth-middleware.md
.king/sessions/2026-03-26_0003_merge_auth-middleware.md
.king/sessions/2026-03-26_0004_audit.md           ← standalone
.king/sessions/2026-03-26_0005_castle.md          ← standalone
```

---

## Tabla de Outputs por Skill

> **Columna Session:** Todos los skills crean su session document via `session-management/SKILL.md Phase N+1`.
> El path exacto sigue el formato arriba.

| Skill | Session | Artefactos propios |
|-------|---------|-------------------|
| `brainstorm` (modo proyecto) | `YYYY-MM-DD_NNNN_brainstorm_context.md` | `.king/docs/architecture/001-{proyecto}-arquitectura.md`, `002-{proyecto}-modelo-datos.md`, `003-{proyecto}-dependencias.md`, `004-{proyecto}-inconsistencias.md` |
| `brainstorm` (modo feature) | `YYYY-MM-DD_NNNN_brainstorm_context.md` | `.king/docs/features/{feature}/design.md` + deltas appendeados a `001-004` si aplica |
| `plan` | `YYYY-MM-DD_NNNN_plan_context.md` | `docs/plans/YYYY-MM-DD-{feature}.md` |
| `build` | `YYYY-MM-DD_NNNN_build_context.md` | Código implementado + tests (en el proyecto) |
| `review` | `YYYY-MM-DD_NNNN_review_context.md` | Report inline (en el session document) |
| `qa` | `YYYY-MM-DD_NNNN_qa_context.md` | Report inline (en el session document) |
| `fix` | `YYYY-MM-DD_NNNN_fix_context.md` | Código corregido + tests (en el proyecto) |
| `merge` | `YYYY-MM-DD_NNNN_merge_context.md` | Branch mergeado + PR cerrado (en GitHub) |
| `promote` | `YYYY-MM-DD_NNNN_promote_context.md` | Worktree sincronizado (en filesystem) |
| `release` | `YYYY-MM-DD_NNNN_release_context.md` | Git tag + GitHub Release + `CHANGELOG.md` actualizado |
| `refactor` | `YYYY-MM-DD_NNNN_refactor_context.md` | Código refactorizado (en el proyecto) |
| `optimize` | `YYYY-MM-DD_NNNN_optimize_context.md` | Código optimizado + benchmarks (en el proyecto) |
| `frontend-design` | `YYYY-MM-DD_NNNN_frontend-design_context.md` | Componentes UI (en el proyecto) |
| `audit` | `YYYY-MM-DD_NNNN_audit.md` *(standalone)* | `.king/docs/audits/YYYY-MM-DD-audit-report.md` + `.king/docs/audits/YYYY-MM-DD-improvement-backlog.md` |
| `genesis` | `YYYY-MM-DD_NNNN_genesis.md` *(standalone)* | Infraestructura `.king/` + `CLAUDE.md` + agentes/skills generados + `.king/knowledge/stack.md` + `.king/knowledge/architecture.md` + `.king/knowledge/conventions.md` + `.king/knowledge/environments.md` |
| `castle` | `YYYY-MM-DD_NNNN_castle.md` *(standalone)* | Reporte inline |
| `gitflow` | `YYYY-MM-DD_NNNN_gitflow.md` *(standalone)* | Estado de branches (inline) |
| `worktree` | `YYYY-MM-DD_NNNN_worktree.md` *(standalone)* | Worktree dirs en `.worktrees/` |
| `test-plan` | `YYYY-MM-DD_NNNN_test-plan.md` *(standalone)* | `.king/docs/test-plans/{slug}-test-plan.html` |
| `refine` | `YYYY-MM-DD_NNNN_refine.md` *(standalone)* | prompt refinado (no persistido — M-3 security: el prompt refinado puede contener lógica sensible del sistema; no se persiste para evitar su exposición en el historial de sesiones) |

---

## Artefactos Compartidos de Infraestructura

Creados por `session-management` durante Phase 0 y Phase N+1:

| Artefacto | Path | Skill que lo crea |
|-----------|------|-------------------|
| Tracking directory | `.king/` | session-management Phase 0.1 (primer skill) |
| Registry | `.king/registry.md` | session-management Phase 0.1 (primer skill) |
| Registry archive | `.king/registry-archive.md` | session-management Phase N+1.3 (append-only, workflows completados >60 días) |
| Workflow context | `.king/workflows/{slug}/context.md` | session-management Phase 0.3 (primer skill del workflow) |
| Session document | `.king/sessions/YYYY-MM-DD_NNNN_skill_context.md` | session-management Phase N+1 (cada skill) |
| Visual evidence dir | `.king/sessions/evidence/YYYY-MM-DD_NNNN_skill_context/` | visual-evidence skill (opcional) |

---

## Artefactos SDD

> Los artefactos SDD siguen su propia convención. Ver `_shared/chronicle-convention.md`.

| Skill | Path |
|-------|------|
| `sdd-init` | `.king/sdd/config.yaml`, `.king/sdd/specs/`, `.king/sdd/archive/` |
| `sdd-propose` | `.king/sdd/{change-name}/proposal.md` |
| `sdd-spec` | `.king/sdd/{change-name}/specs/{domain}/spec.md` |
| `sdd-design` | `.king/sdd/{change-name}/design.md` |
| `sdd-tasks` | `.king/sdd/{change-name}/tasks.md` |
| `sdd-verify` | `.king/sdd/{change-name}/verify-report.md` |
| `sdd-archive` | `.king/sdd/archive/YYYY-MM-DD-{change-name}/` |

---

## Cómo usar esta tabla en SKILL.md

En la sección REQUIRED OUTPUTS de cada skill, referencia este archivo en lugar de hardcodear:

```markdown
### REQUIRED OUTPUTS
> 📦 Ver `skills/_shared/lifecycle-outputs.md` para la convención de rutas

- [ ] Session document creado (via session-management Phase N+1)
- [ ] [artefactos específicos de este skill, listados arriba]
```

## Ver también

- `knowledge/session-tracking.md` — Documentación completa del sistema de sesiones
- `skills/session-management/SKILL.md` — Implementación de Phase 0 / N+1 / N+2
- `skills/_shared/chronicle-convention.md` — Convención de paths para SDD skills
