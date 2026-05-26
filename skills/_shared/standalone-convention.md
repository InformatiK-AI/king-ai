# Standalone Convention — Session Tracking para Skills Autónomos

> Define el comportamiento de session tracking para skills **standalone**: aquellos que no forman parte de un workflow activo y no requieren coordinación con otros skills en secuencia.

---

## ¿Qué es un Skill Standalone?

Un skill es **standalone** cuando se invoca de forma independiente, sin un workflow activo en `.king/registry.md`. Ejemplos: `/castle`, `/gitflow`, `/radar`, `/github-ops`, `/create-skill`.

Contrasta con skills de **flujo de vida** (como `/build`, `/qa`, `/review`) que siempre se ejecutan en el contexto de un workflow iniciado por `/genesis`.

---

## Regla de Fast-Path

Cuando un skill standalone detecta que `.king/registry.md` NO existe (o no tiene ningún workflow activo), activa el **fast-path** definido en `session-management/SKILL.md`:

```
IF .king/registry.md NO EXISTE
   AND skill invocador ES standalone
THEN
   Mostrar banner simplificado: "▶ /[skill-name] | standalone | [YYYY-MM-DD HH:MM]"
   Capturar EXEC_USER y EXEC_START
   RETURN — saltar Pasos 0.1 a 0.5 de session-management
   Phase N+1: si registry existe, registrar en "Sesiones Recientes";
              si no existe, omitir tracking y solo mostrar footer N+2
```

**Objetivo**: evitar el overhead de 350-400 tokens de instrucciones + 3-5 file reads cuando no aporta valor.

---

## Naming Convention para Session Documents

Los skills standalone usan el formato **sin `_context`**:

```
.king/sessions/YYYY-MM-DD_NNNN_skill-name.md
```

| Componente | Descripción |
|------------|-------------|
| `YYYY-MM-DD` | Fecha de ejecución ISO |
| `NNNN` | Secuencial global del día (0001, 0002...) |
| `skill-name` | Nombre del skill en kebab-case |

**Ejemplos:**
```
.king/sessions/2026-04-14_0001_castle.md
.king/sessions/2026-04-14_0002_radar.md
.king/sessions/2026-04-14_0003_gitflow.md
```

Referencia completa de naming: `skills/_shared/lifecycle-outputs.md`.

---

## Session Document (Phase N+1)

El session document de un skill standalone contiene:

```markdown
# Session: /[skill-name] — [YYYY-MM-DD]

**Usuario**: [EXEC_USER]
**Inicio**: [EXEC_START]
**Fin**: [EXEC_END]
**Skill**: [skill-name]
**Modo**: standalone

## Resumen

[Resumen de lo ejecutado — 2-5 líneas]

## Artefactos

[Lista de archivos creados/modificados, o "None"]

## Estado

[COMPLETE | PARTIAL | BLOCKED]
```

---

## Ver también

- `skills/_shared/lifecycle-outputs.md` — tabla de outputs por skill con paths canónicos
- `skills/session-management/SKILL.md` — implementación completa de Phase 0 / N+1 / N+2
- `knowledge/session-tracking.md` — documentación completa del sistema de sesiones
