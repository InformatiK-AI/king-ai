# Slot Convention — Project-Specific Value References

> Defines the `{{SLOT_NAME}}` pattern for referencing project-specific values in skill files.
> Read this file when writing or updating any skill that references environment config, ports, paths, or session metadata.

---

## What Is a Slot?

A **slot** is a `{{SLOT_NAME}}` placeholder in a skill file that gets resolved at runtime (Phase 0) from the project's environment files. Slots prevent hardcoding of values that differ between projects and environments.

**Format**: `{{SLOT_NAME}}` — double curly braces, UPPER_SNAKE_CASE.

**Resolution**: Phase 0 (Load Context) substitutes slots BEFORE Phase 1 executes.
If a slot cannot be resolved: log `WARN: {{SLOT_NAME}} unresolved, using default: {value}` and continue.

---

## Slot Categories & Authoritative Sources

### 1. Environment Slots
Source: `.worktrees/environments/{env}/.env`

| Slot | Dev | QA | Prod |
|------|-----|----|------|
| `{{DEV_PORT}}` / `{{QA_PORT}}` / `{{PROD_PORT}}` | Port for each env | | |
| `{{DEV_DB_URL}}` / `{{QA_DB_URL}}` / `{{PROD_DB_URL}}` | DB connection string | | |
| `{{DEV_API_URL}}` / `{{QA_API_URL}}` / `{{PROD_API_URL}}` | API base URL | | |
| `{{CORS_ORIGIN}}` | Allowed CORS origin (env-specific) | | |

Read with: `source .worktrees/environments/{env}/.env`

### 2. Infrastructure Slots
Source: git commands (resolved at Phase 0)

| Slot | Resolved from |
|------|---------------|
| `{{BRANCH_NAME}}` | `git branch --show-current` |
| `{{COMMIT_HASH}}` | `git rev-parse --short HEAD` |
| `{{PROJECT_ROOT}}` | `git rev-parse --show-toplevel` |

### 3. Worktree Slots
Source: stable paths relative to repo root

| Slot | Path |
|------|------|
| `{{DEV_WORKTREE}}` | `.worktrees/environments/dev/` |
| `{{QA_WORKTREE}}` | `.worktrees/environments/qa/` |
| `{{PROD_WORKTREE}}` | `.worktrees/environments/prod/` |

### 4. Session Slots
Source: computed at Phase 0 execution time

| Slot | Resolved from |
|------|---------------|
| `{{SESSION_DATE}}` | `date -u +%Y-%m-%d` (ISO 8601) |
| `{{SESSION_SEQ}}` | Count of files in `.king/sessions/` + 1, zero-padded to 4 digits |
| `{{SESSION_SKILL}}` | Skill name in lowercase (e.g., `build`, `fix`) |
| `{{SESSION_CONTEXT}}` | Workflow name or branch slug, max 40 chars |

---

## Hardcoding Policy

### FORBIDDEN — Never hardcode these in skill files

- Ports (`3001`, `8080`, `5432`)
- Database connection strings
- Absolute worktree paths (e.g., `C:/Users/.../king/...`)
- API endpoints, domain names, hostnames
- Credentials, tokens, secrets
- Company names, project-specific names
- Stack versions (`React 18.3.1`, `Node v20`)

### ALLOWED — Safe to hardcode

- Standard directory names: `.king/`, `.worktrees/`, `king-framework/`, `src/`, `tests/`
- Base branch names: `main`, `develop`
- HTTP status codes: `200`, `404`, `500`
- King Framework constants: `CONDITIONAL`, `FORTIFIED`, `BREACHED`
- Relative paths within the plugin: `skills/_shared/...`, `agents/...`
- Git conventional commit types: `feat`, `fix`, `chore`, `docs`

---

## Migration Examples

### Before (hardcoded) → After (slot)

**`promote/SKILL.md` — port numbers:**
```markdown
BEFORE: cd .worktrees/environments/dev && PORT=3001 npm start
AFTER:  cd {{DEV_WORKTREE}} && PORT={{DEV_PORT}} npm start
```

**`gitflow/SKILL.md` — database URL:**
```markdown
BEFORE: DATABASE_URL=mongodb://localhost:27017/king-dev
AFTER:  DATABASE_URL={{DEV_DB_URL}}
```

**`frontend-design/SKILL.md` — stack version:**
```markdown
BEFORE: Tech stack: React 18.3.1 + Tailwind CSS 4
AFTER:  Tech stack: see `.king/knowledge/stack.md`
```

**`promote/SKILL.md` — worktree path:**
```markdown
BEFORE: ls .worktrees/environments/qa/
AFTER:  ls {{QA_WORKTREE}}
```

---

## Unresolved Slot Behavior

If Phase 0 cannot resolve a slot:

1. Log: `WARN: {{SLOT_NAME}} unresolved — source: {source}`
2. Use safe default if one exists (document the default in the skill)
3. Continue execution (never block on unresolved slot)
4. Surface in Execution Summary under Risks if the slot was critical

If a skill REQUIRES a slot (no safe default): add the slot check to BLOCKING CONDITIONS:
```markdown
### BLOCKING CONDITIONS
- [ ] `{{DEV_PORT}}` resolves from `.worktrees/environments/dev/.env`
```
