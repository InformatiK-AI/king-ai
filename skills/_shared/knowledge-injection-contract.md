# Knowledge Injection Contract — Graceful Degradation Pattern

> Defines the standard Knowledge Injection block format and injection matrix for non-SDD skills.
> Reference this file when deciding which knowledge files a skill should read.

---

## Standard Knowledge Injection Block

Place this block AFTER YAML frontmatter and BEFORE QUICK REFERENCE in every skill:

```markdown
## Knowledge Injection

Read the following files BEFORE Phase 1. If a file does not exist, log a warning and continue — graceful degradation applies.

| File | Purpose | Required | Source |
|------|---------|----------|--------|
| `.king/knowledge/architecture.md` | Architectural patterns and decisions | Yes | project |
| `.king/knowledge/conventions.md` | Code style, naming, testing standards | Yes | project |
| `knowledge/_inject/security-essentials.md` | Security patterns | No | framework |
```

**Required = Yes**: skill behavior depends on this file. Warn if missing, but continue.
**Required = No**: optional enrichment. Warn if missing, skip gracefully.

### Graceful Degradation Clause (ALWAYS include)

```markdown
**Graceful degradation**: If a file does not exist, log a warning and continue.
```

---

## Two Knowledge Sources

| Source | Path | Type |
|--------|------|------|
| **Project knowledge** | `.king/knowledge/*.md` | Project-specific context |
| **Framework knowledge** | `knowledge/_inject/*-essentials.md` | Reusable domain patterns |

**Read order**: Project knowledge FIRST, then framework essentials.
Rationale: project-specific context overrides generic framework defaults.

---

## Available Framework Knowledge Files

| File | Domain | Use when skill needs |
|------|--------|---------------------|
| `api-design-essentials.md` | API design | REST, GraphQL, contract design |
| `context7-essentials.md` | Context7 MCP | Library docs lookup |
| `frontend-essentials.md` | UI/UX, accessibility | Frontend, component, a11y work |
| `git-essentials.md` | Git operations | Branching, commits, merges |
| `observability-essentials.md` | Monitoring, logging | Deployments, health checks |
| `performance-essentials.md` | Optimization | Profiling, benchmarks, latency |
| `prompt-engineering-essentials.md` | Prompt design | Skills, agents, LLM integration |
| `security-essentials.md` | Security patterns | Code review, auth, OWASP |
| `testing-essentials.md` | Testing strategies | QA, TDD, coverage analysis |

---

## Injection Matrix

Minimum required injection per skill. Skills MAY add domain-specific files with justification.

| Skill | architecture | conventions | stack | environments | security | testing | performance | frontend | git | observability |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/build` | ✓ | ✓ | ✓ | ✓ | – | – | – | – | – | – |
| `/fix` | ✓ | ✓ | – | – | ✓ | – | – | – | – | – |
| `/review` | ✓ | ✓ | – | – | ✓ | ✓ | – | – | – | – |
| `/qa` | ✓ | ✓ | – | – | ✓ | ✓ | – | – | – | – |
| `/refactor` | ✓ | ✓ | ✓ | – | – | – | – | – | – | – |
| `/optimize` | ✓ | ✓ | – | – | – | – | ✓ | – | – | – |
| `/test-plan` | – | ✓ | – | – | – | ✓ | – | – | – | – |
| `/brainstorm` | ✓ | ✓ | ✓ | – | – | – | – | – | – | – |
| `/plan` | ✓ | ✓ | ✓ | – | – | – | – | – | – | – |
| `/frontend-design` | ✓ | ✓ | – | – | – | – | – | ✓ | – | – |
| `/merge` | – | ✓ | – | – | – | – | – | – | ✓ | – |
| `/promote` | – | – | – | ✓ | – | – | – | – | – | ✓ |
| `/release` | – | ✓ | – | – | – | – | – | – | ✓ | ✓ |
| `/gitflow` | – | – | – | ✓ | – | – | – | – | ✓ | – |
| `/genesis` | – | – | – | – | – | – | – | – | – | – |
| `/create-issues` | ✓ | ✓ | – | – | – | – | – | – | – | – |
| `/audit` | ✓ | ✓ | – | – | – | – | – | – | – | – |
| `/castle` | – | ✓ | – | – | – | – | – | – | – | – |
| `/radar` | – | – | – | – | – | – | – | – | – | – |
| `/worktree` | – | – | – | ✓ | – | – | – | – | ✓ | – |
| `/refine` | – | – | – | – | – | – | – | – | – | – |

Legend: ✓ = inject (Required: Yes) | – = omit

> **Nota `/genesis`**: En el momento de ejecución de genesis, los archivos `.king/knowledge/` aún no existen (genesis los crea). Por eso no tiene inyección requerida. Sin embargo, si genesis se re-ejecuta en un proyecto existente, PUEDE leer los archivos de knowledge si existen.
>
> **Nota `/refine`**: skill standalone de optimización de prompts. No requiere knowledge injection del proyecto para operar; su conocimiento es `prompt-engineering-essentials.md` (inyectado opcionalmente vía su propio bloque KI).

---

## Minimum Viable Injection

All non-SDD skills MUST have a Knowledge Injection block.
If the skill has no domain-specific needs, use:

```markdown
## Knowledge Injection

Read the following file BEFORE Phase 1. If it does not exist, log a warning and continue.

| File | Purpose | Required | Source |
|------|---------|----------|--------|
| `.king/knowledge/conventions.md` | Project conventions | No | project |
```

---

## Custom Knowledge (Skills MAY extend the matrix)

Skills may add files beyond the matrix with a justification comment:

```markdown
| `knowledge/_inject/api-design-essentials.md` | GraphQL schema patterns (custom: this skill generates GraphQL) | No | framework |
```

The matrix is a **starting point**, not a ceiling.
