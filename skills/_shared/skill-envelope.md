# Skill Execution Summary — Template Canónico

> **Uso**: Cada skill non-SDD DEBE incluir una sección `## Execution Summary` antes de su fase "Write Session". Esta sección sirve como envelope estructurado para consumo del usuario y para composición con otros skills. Copiar el bloque de tabla a continuación y completar los valores.

## Execution Summary

| Field | Value |
|-------|-------|
| Status | `COMPLETE` \| `PARTIAL` \| `BLOCKED` |
| CASTLE Verdict | `FORTIFIED` \| `CONDITIONAL` \| `BREACHED` |
| Artifacts | _lista de archivos creados/modificados, o "None"_ |
| Next Recommended | `/[skill] [args]` |
| Risks | _lista de riesgos pendientes, o "None"_ |

---

## Guía de Valores

### Status
| Valor | Cuándo usar |
|-------|-------------|
| `COMPLETE` | Todos los REQUIRED OUTPUTS existen y FINAL CHECKPOINT pasó |
| `PARTIAL` | Algunos outputs existen pero hay issues no bloqueantes (ej: CASTLE CONDITIONAL) |
| `BLOCKED` | Ejecución detenida por BLOCKING CONDITION o CASTLE BREACHED |

### CASTLE Verdict
Copiar el veredicto del CASTLE Assessment ejecutado durante el skill:
- `FORTIFIED` — todas las gates activas en PASS
- `CONDITIONAL` — al menos una gate en WARNING, ninguna en BREACH
- `BREACHED` — al menos una gate en BREACH (implica `Status: BLOCKED`)

### Artifacts
Listar los artefactos producidos durante la sesión (código, docs, configs, PRs, branches). Si el skill no produce artefactos persistentes, escribir "None".

Ejemplos:
```
- `feature/auth-middleware` branch — creado
- `docs/plans/2026-04-14-auth.md` — plan generado
- PR #42 — creado en GitHub
```

### Next Recommended
Copiar de la tabla de flujo del skill (Guide Next Step). Incluir argumentos si son conocidos.

Ejemplos: `/review`, `/qa --standard`, `/fix #42`

### Risks
Listar riesgos activos identificados durante la sesión. Si CASTLE es CONDITIONAL, incluir el finding. Si no hay riesgos: "None".

---

## Notas de Implementación

- El `## Execution Summary` NO reemplaza la Phase N+2 (Guide Next Step) — son para audiencias distintas:
  - **Execution Summary**: tabla compacta, scannable, composable con otros skills o meta-scripts
  - **Guide Next Step**: narrativa con árbol de decisión para el usuario humano
- El `## Execution Summary` va DESPUÉS del FINAL CHECKPOINT y ANTES de la fase "Write Session"
- En SDD sub-agentes, el equivalente es el return envelope YAML. Esta tabla es la versión human-readable para skills non-SDD.
