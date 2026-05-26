# Skill Anatomy — Non-SDD Skill Structure Reference

> Read this file BEFORE creating or significantly modifying a non-SDD skill.
> Defines the canonical structure for v2.0 skills and the semantic contracts between condition types.

---

## Canonical Section Order

Every non-SDD skill MUST follow this layout (in order):

```
1.  YAML Frontmatter           name, version, description
2.  Knowledge Injection         → see knowledge-injection-contract.md
3.  QUICK REFERENCE
    3a. BLOCKING CONDITIONS     Global pre-execution state gates
    3b. ABSOLUTE RESTRICTIONS   (Optional) Runtime behavior prohibitions
    3c. REQUIRED OUTPUTS        Artifacts the skill MUST produce
    3d. PHASES OVERVIEW         ASCII DAG of phases and gates
4.  CASTLE active line          → see castle-capas.md
5.  Phase 0                     Load Context (session-management)
6.  Phases 1..N                 Each: GATE IN → MUST DO → CHECKPOINT → OUTPUTS → IF FAILS
7.  FINAL CHECKPOINT            Verify all REQUIRED OUTPUTS exist
8.  Execution Summary           → see skill-envelope.md
9.  Phase N+1                   Write Session (session-management)
10. Phase N+2                   Guide Next Step (flow table)
11. REFERENCE                   Non-action context, edge cases, integrations
```

---

## Semantic Contracts

### BLOCKING CONDITIONS
- **When**: Checked once, globally, BEFORE Phase 0 executes
- **Format**: Checkbox list (`[ ]`)
- **Fail behavior**: Abort skill entirely — surface reason to user
- **Examples**: `[ ] /genesis has been run`, `[ ] git repo exists`, `[ ] build session active`

### GATE IN (per phase)
- **When**: Checked at the START of each individual phase
- **Format**: Checkbox list (`[ ]`)
- **Fail behavior**: SKIP this phase silently — continue to next GATE IN
- **Examples**: `[ ] Previous phase artifact exists`, `[ ] User confirmed scope`

### CHECKPOINT (per phase)
- **When**: Checked AFTER all MUST DO actions complete
- **Format**: Checkbox list (`[ ]`)
- **Fail behavior**: Enter IF FAILS — never silently continue
- **Examples**: `[ ] Output file created`, `[ ] Tests pass`, `[ ] No hardcoded values`

### ABSOLUTE RESTRICTIONS
- **When**: Active for the entire skill execution (runtime prohibitions)
- **Format**: Bullet list (`-`) with `NEVER [prohibition]` — NOT checkboxes
- **Fail behavior**: Violation = CASTLE BREACHED
- **Examples**: `NEVER modify files outside project root`, `NEVER skip CHECKPOINT`

### MUST DO
- **When**: The ordered, mandatory actions within a phase
- **Format**: Numbered checkbox list (`1. [ ] **Action** — detail`)
- **Semantics**: ALL are mandatory, execute in order, check as you go

---

## Phase Integration: Session-Management

Phase 0 and Phase N+1 are ALWAYS delegated to `session-management/SKILL.md`:

- **Phase 0 — Load Context**: Loads workflow context, resolves `{{SLOT}}` values, reads Knowledge Injection files
- **Phase N+1 — Write Session**: Persists session document to `.king/sessions/YYYY-MM-DD_NNN_skill-name.md`

Skills MUST NOT redefine Phase 0 or Phase N+1 logic inline. Reference:
```markdown
## Phase 0: Load Context
> Delegated to `skills/session-management/SKILL.md` Phase 0
```

**Execution Summary position**: AFTER FINAL CHECKPOINT, BEFORE Phase N+1.
See `skills/_shared/skill-envelope.md` for the canonical table format.

---

## Cross-File References

| Need | Read |
|------|------|
| GATE IN / CHECKPOINT / IF FAILS semantics | `skills/_shared/gate-checkpoint-contract.md` |
| Which knowledge files to inject | `skills/_shared/knowledge-injection-contract.md` |
| Reusable IF FAILS blocks | `skills/_shared/if-fails-templates.md` |
| Project-specific value placeholders | `skills/_shared/slot-convention.md` |
| Execution Summary table format | `skills/_shared/skill-envelope.md` |
| Session document naming / paths | `skills/_shared/lifecycle-outputs.md` |
| CASTLE layer activation per skill | `skills/_shared/castle-capas.md` |

---

## Anti-Patterns

| Anti-Pattern | Consequence | Correct Approach |
|---|---|---|
| Hardcoding ports, DB URLs, worktree paths | Breaks on any new project | Use `{{SLOT_NAME}}` → `slot-convention.md` |
| Phase without GATE IN | Executes when it should skip | Always include GATE IN (even trivial) |
| Phase without IF FAILS | Silent failures | Always include IF FAILS → `if-fails-templates.md` |
| ABSOLUTE RESTRICTIONS with checkboxes | Semantic confusion with BLOCKING CONDITIONS | Use bullet `-` list with `NEVER` prefix |
| Knowledge Injection without graceful degradation | Blocks on missing files | "If not exists: warn and continue" clause |
| Phases without CHECKPOINT | No verification before advancing | All MUST DO actions need CHECKPOINT |
| Actions in REFERENCE section | Execution ambiguity | REFERENCE is documentation-only |
