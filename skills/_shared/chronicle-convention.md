# Chronicle File Convention (shared across all SDD skills)

Chronicle es el backend de persistencia por defecto de King Framework. Usa la estructura filesystem `.king/sdd/` que ya forma parte de todo proyecto inicializado con `/genesis`. Zero dependencias externas.

## Directory Structure

```
.king/
└── sdd/
    ├── config.yaml              ← Project-specific SDD config
    ├── specs/                   ← Source of truth (main specs)
    │   └── {domain}/
    │       └── spec.md
    ├── archive/                 ← Completed changes (YYYY-MM-DD-{change-name}/)
    └── {change-name}/           ← Active change folder
        ├── state.yaml           ← DAG state (orchestrator, survives compaction)
        ├── exploration.md       ← (optional) from sdd-explore
        ├── proposal.md          ← from sdd-propose
        ├── specs/               ← from sdd-spec
        │   └── {domain}/
        │       └── spec.md      ← Delta spec
        ├── design.md            ← from sdd-design
        ├── tasks.md             ← from sdd-tasks (updated by sdd-apply)
        └── verify-report.md     ← from sdd-verify
```

## Artifact File Paths

| Skill | Creates / Reads | Path |
|-------|----------------|------|
| orchestrator | Creates/Updates | `.king/sdd/{change-name}/state.yaml` (DAG state for compaction recovery) |
| sdd-init | Creates | `.king/sdd/config.yaml`, `.king/sdd/specs/`, `.king/sdd/`, `.king/sdd/archive/` |
| sdd-explore | Creates (optional) | `.king/sdd/{change-name}/exploration.md` |
| sdd-propose | Creates | `.king/sdd/{change-name}/proposal.md` |
| sdd-spec | Creates | `.king/sdd/{change-name}/specs/{domain}/spec.md` |
| sdd-design | Creates | `.king/sdd/{change-name}/design.md` |
| sdd-tasks | Creates | `.king/sdd/{change-name}/tasks.md` |
| sdd-apply | Updates | `.king/sdd/{change-name}/tasks.md` (marks `[x]`) |
| sdd-verify | Creates | `.king/sdd/{change-name}/verify-report.md` |
| sdd-archive | Moves | `.king/sdd/{change-name}/` → `.king/sdd/archive/YYYY-MM-DD-{change-name}/` |
| sdd-archive | Updates | `.king/sdd/specs/{domain}/spec.md` (merges deltas into main specs) |

## Reading Artifacts

Each skill reads its dependencies from the filesystem:

```
Proposal:   .king/sdd/{change-name}/proposal.md
Specs:      .king/sdd/{change-name}/specs/  (all domain subdirectories)
Design:     .king/sdd/{change-name}/design.md
Tasks:      .king/sdd/{change-name}/tasks.md
Verify:     .king/sdd/{change-name}/verify-report.md
Config:     .king/sdd/config.yaml
Main specs: .king/sdd/specs/{domain}/spec.md
```

## Writing Rules

- ALWAYS create the change directory (`.king/sdd/{change-name}/`) before writing artifacts
- If a file already exists, READ it first and UPDATE it (don't overwrite blindly)
- If the change directory already exists with artifacts, the change is being CONTINUED
- Use the `.king/sdd/config.yaml` `rules` section to apply project-specific constraints per phase

## Upsert Pattern

Upsert = sobreescribir el archivo en la misma ruta. Chronicle nunca crea duplicados porque las rutas son determinísticas:

```
Write proposal: .king/sdd/{change-name}/proposal.md  ← always same path
Update tasks:   .king/sdd/{change-name}/tasks.md      ← update [x] markers in-place
```

## Searching Artifacts

Chronicle usa `grep -r` sobre archivos markdown — no requiere FTS5:

```bash
# Find all active SDD changes
ls .king/sdd/*/state.yaml

# Search across all change artifacts
grep -r "keyword" .king/sdd/

# Find a specific artifact
cat .king/sdd/{change-name}/proposal.md
```

## State Recovery (Post-Compaction)

After context compaction, recovery is direct filesystem reads — no multi-step MCP protocol:

1. Read `.king/sdd/{change-name}/state.yaml` → know current phase
2. Read `.king/registry.md` → know active workflows
3. Read last session in `.king/sessions/` → know last context
4. Continue with `/sdd-continue`

## Config File Reference

```yaml
# .king/sdd/config.yaml
schema: spec-driven

context: |
  Tech stack: {detected}
  Architecture: {detected}
  Testing: {detected}
  Style: {detected}

rules:
  proposal:
    - Include rollback plan for risky changes
  specs:
    - Use Given/When/Then for scenarios
    - Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
  design:
    - Include sequence diagrams for complex flows
    - Document architecture decisions with rationale
  tasks:
    - Group by phase, use hierarchical numbering
    - Keep tasks completable in one session
  apply:
    - Follow existing code patterns
    tdd: false           # Set to true to enable RED-GREEN-REFACTOR
    test_command: ""     # e.g., "npm test", "pytest"
  verify:
    test_command: ""     # Override for verification
    build_command: ""    # Override for build check
    coverage_threshold: 0  # Set > 0 to enable coverage check
  archive:
    - Warn before merging destructive deltas
```

## Archive Structure

When archiving, the change folder moves to:
```
.king/sdd/archive/YYYY-MM-DD-{change-name}/
```

Use today's date in ISO format (e.g., `2026-03-17`). The archive is an AUDIT TRAIL — never delete or modify archived changes.
