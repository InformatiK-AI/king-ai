# Path Resolution Convention

> This file defines how to resolve plugin-internal file paths in King Framework.
> Reference this when a skill or agent needs to Read a file from the framework.

---

## The Problem

King Framework can be installed in two ways:

| Install type | Plugin location |
|---|---|
| Local dev | `<project-root>/king-framework/` |
| Remote (`claude plugin add`) | `~/.claude/plugins/king-framework/` |

Relative paths like `skills/_shared/lifecycle-outputs.md` only work in local installs.
Prefixed paths like `king-framework/knowledge/_inject/security-essentials.md` only work in local installs.

## The Solution

At session start, King Framework announces its absolute install path:

```
KING_FRAMEWORK_PATH=/absolute/path/to/king-framework
```

All relative plugin-internal paths must be resolved against this value.

## Path Resolution Rule

When you encounter a Read instruction referencing a plugin-internal path — any path starting with
`skills/`, `agents/`, `knowledge/`, `rules/`, `commands/`, `hooks/`, `security/`, `validation/`, or `templates/` —
construct the absolute path by prepending KING_FRAMEWORK_PATH:

```
Read KING_FRAMEWORK_PATH + "/" + relative_path
```

**Example**: if `KING_FRAMEWORK_PATH=/home/user/.claude/plugins/king-framework`

| Relative path in skill | Absolute path to Read |
|---|---|
| `skills/_shared/lifecycle-outputs.md` | `/home/user/.claude/plugins/king-framework/skills/_shared/lifecycle-outputs.md` |
| `agents/conductor.md` | `/home/user/.claude/plugins/king-framework/agents/conductor.md` |
| `knowledge/_inject/security-essentials.md` | `/home/user/.claude/plugins/king-framework/knowledge/_inject/security-essentials.md` |

## For Project Files

Paths starting with `.king/` are project-scoped and resolve against the git root (standard behavior).
Do NOT prepend KING_FRAMEWORK_PATH to `.king/` paths.
