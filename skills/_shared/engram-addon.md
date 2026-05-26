# Engram Addon (opcional — power users)

## MCP Tools Overview

Engram expone **14 MCP tools** divididas en dos perfiles:

| Perfil | Tools (11) | Descripción |
|--------|-----------|-------------|
| **Agent** (11) | `mem_save`, `mem_search`, `mem_get_observation`, `mem_update`, `mem_delete`, `mem_list_topics`, `mem_get_topic`, `mem_timeline`, `mem_smart_search`, `mem_smart_outline`, `mem_smart_unfold` | Operaciones de lectura/escritura de artifacts para agentes |
| **Admin** (3) | `mem_admin_backup`, `mem_admin_restore`, `mem_admin_stats` | Administración del backend Engram (solo power users) |

> Los agentes de King Framework solo necesitan el perfil **Agent** (11 tools). Las 3 tools admin son opcionales para mantenimiento.

Engram es un **addon opcional** para King Framework que provee búsqueda FTS5, memoria cross-project, y persistencia SQLite via un binario externo.

El backend de persistencia por defecto es **Chronicle** (filesystem `.king/sdd/`). Engram solo se necesita cuando:
- Necesitas memoria cross-project (buscar artifacts de múltiples repos)
- Necesitas búsqueda full-text ranked (FTS5)
- Quieres cloud sync via el servidor Engram

## Instalación

1. Instalar el binario Engram:
   ```bash
   go install github.com/gentleman-programming/engram@latest
   ```

2. Crear `.mcp.json` en la raíz del proyecto:
   ```json
   {
     "mcpServers": {
       "engram": {
         "command": "engram",
         "args": ["serve"]
       }
     }
   }
   ```

3. Activar en el orquestador SDD pasando `artifact_store.mode: engram`.

## Artifact Naming Convention

ALL SDD artifacts persisted to Engram MUST follow this deterministic naming:

```
title:     sdd/{change-name}/{artifact-type}
topic_key: sdd/{change-name}/{artifact-type}
type:      architecture
project:   {detected or current project name}
scope:     project
```

### Artifact Types (exact strings)

| Artifact Type | Produced By | Description |
|---------------|-------------|-------------|
| `explore` | sdd-explore | Exploration analysis |
| `proposal` | sdd-propose | Change proposal |
| `spec` | sdd-spec | Delta specifications (all domains concatenated) |
| `design` | sdd-design | Technical design |
| `tasks` | sdd-tasks | Task breakdown |
| `apply-progress` | sdd-apply | Implementation progress (one per batch) |
| `verify-report` | sdd-verify | Verification report |
| `archive-report` | sdd-archive | Archive closure with lineage |
| `state` | orchestrator | DAG state for recovery after compaction |

**Exception**: `sdd-init` uses `sdd-init/{project-name}` as both title and topic_key (it's project-scoped, not change-scoped).

### State Artifact

The orchestrator persists DAG state after each phase transition:

```
mem_save(
  title: "sdd/{change-name}/state",
  topic_key: "sdd/{change-name}/state",
  type: "architecture",
  project: "{project}",
  content: "change: {change-name}\nphase: {last-phase}\nartifact_store: engram\nartifacts:\n  proposal: true\n  specs: true\n  design: false\n  tasks: false\ntasks_progress:\n  completed: []\n  pending: []\nlast_updated: {ISO date}"
)
```

Recovery: `mem_search("sdd/{change-name}/state")` → `mem_get_observation(id)` → parse YAML → restore orchestrator state.

## Recovery Protocol (2 steps — MANDATORY)

To retrieve an artifact from Engram, ALWAYS use this two-step process:

```
Step 1: Search by topic_key pattern
  mem_search(query: "sdd/{change-name}/{artifact-type}", project: "{project}")
  → Returns a truncated preview with an observation ID

Step 2: Get full content (REQUIRED)
  mem_get_observation(id: {observation-id from step 1})
  → Returns complete, untruncated content
```

NEVER use `mem_search` results directly as the full artifact — they are truncated previews.
ALWAYS call `mem_get_observation` to get the complete content.

### Retrieving Multiple Artifacts

When a skill needs multiple artifacts (e.g., sdd-tasks needs proposal + spec + design):

```
1. mem_search(query: "sdd/{change-name}/proposal", project: "{project}") → get ID
2. mem_search(query: "sdd/{change-name}/spec", project: "{project}") → get ID
3. mem_search(query: "sdd/{change-name}/design", project: "{project}") → get ID
4. mem_get_observation(id) for EACH → full content
```

## Writing Artifacts

### Standard Write (new artifact)

```
mem_save(
  title: "sdd/{change-name}/{artifact-type}",
  topic_key: "sdd/{change-name}/{artifact-type}",
  type: "architecture",
  project: "{project}",
  content: "{full markdown content}"
)
```

### Update Existing Artifact

```
mem_update(
  id: {observation-id},
  content: "{updated full content}"
)
```

Use `mem_update` when you have the exact observation ID. Use `mem_save` with the same `topic_key` for upserts (Engram deduplicates by topic_key).

## Chronicle vs Engram

| Use case | Recomendación |
|----------|---------------|
| Proyecto individual, desarrollo local | **Chronicle** (default) — zero config |
| Múltiples proyectos, búsqueda cross-repo | **Engram** addon |
| Equipo con servidor Engram compartido | **Engram** addon |
| Lo mejor de ambos | **Hybrid** mode |
