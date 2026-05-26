# IF FAILS Templates — Reusable Error Handling Blocks

> Reusable IF FAILS blocks for the most common failure modes in non-SDD skills.
> Copy and adapt these for each phase that can fail. Customize `{values}` for the specific context.
> IF FAILS is phase-scoped — each phase has its own independent block.

---

## Canonical Format

```markdown
### IF FAILS
> ❌ What to do when CHECKPOINT fails

ERROR: [Title — what went wrong in 5-8 words]
Cause: [Why it happened — 1-2 sentences]
Recovery:
  [ ] Option A: [Most likely to work — try this first]
  [ ] Option B: [Fallback]
  [ ] Option C: [Last resort / escalate to user]
```

---

## Template Library

### FAIL-FILE-NOT-FOUND
```
ERROR: Required file does not exist: {path}
Cause: Path incorrect, file not yet created, or /genesis not run.
Recovery:
  [ ] Verify path: confirm spelling and case (case-sensitive on Linux/macOS)
  [ ] Run /genesis if .king/ infrastructure is missing
  [ ] If file is optional: proceed and log WARN "proceeding without {path}"
  [ ] If required: abort, ask user to provide correct path
```

### FAIL-WRITE-PERMISSION
```
ERROR: Cannot write to {path}
Cause: Directory missing, no write permission, or disk full.
Recovery:
  [ ] Create directory: `mkdir -p {dir}`
  [ ] Check permissions: `ls -ld {dir}`
  [ ] Check disk space: `df -h {dir}`
  [ ] If all fail: abort, ask user to create directory manually
```

### FAIL-VALIDATION
```
ERROR: Input does not match expected format: {field}
Cause: Required field missing, value out of range, or schema mismatch.
Recovery:
  [ ] Show expected format with example value
  [ ] Ask user to correct and retry Phase {N}
  [ ] If a safe default exists: use it and log WARN "using default: {default}"
```

### FAIL-CONFIG-INVALID
```
ERROR: Configuration malformed or missing required key: {key}
Cause: .env missing, YAML syntax error, or required variable unset.
Recovery:
  [ ] Verify .king/ structure exists — run /genesis if missing
  [ ] Show expected key: {key} = {example_value}
  [ ] Check for syntax errors: `cat {config_file}` and inspect formatting
  [ ] Ask user to set the missing value
```

### FAIL-COMMAND-EXIT
```
ERROR: Command failed with non-zero exit: {command}
Cause: Tool not installed, permission denied, or logic error.
Recovery:
  [ ] Show last 20 lines of stderr output
  [ ] Verify tool is installed: `{tool} --version`
  [ ] Check permissions on target path: `ls -la {path}`
  [ ] Ask user to run manually and paste output for diagnosis
```

### FAIL-ARTIFACT-MISSING
```
ERROR: Expected output artifact not found: {path}
Cause: Write operation failed silently, process crashed, or wrong path used.
Recovery:
  [ ] Check disk space: `df -h`
  [ ] Retry Phase {N} MUST DO step {M} explicitly
  [ ] If still missing: ask user to create file manually at {path}
```

### FAIL-CHECKPOINT-ASSERTION
```
ERROR: Verification assertion failed: {assertion}
Cause: Output value does not match expected condition.
Recovery:
  [ ] Show actual vs expected (side-by-side)
  [ ] Ask user: fix manually or retry Phase {N} from MUST DO?
  [ ] Document workaround in session note for future reference
```

### FAIL-API-TIMEOUT
```
ERROR: External request timed out or network unreachable: {endpoint}
Cause: Network delay, service unavailable, or request too large.
Recovery:
  [ ] Retry once after 2s (do not loop)
  [ ] If offline mode available: proceed with cached/fallback data
  [ ] If critical: abort, ask user to retry when connection is available
```

### FAIL-JSON-PARSE
```
ERROR: Invalid JSON in {file}
Cause: Syntax error — missing comma, trailing comma, or unquoted key.
Recovery:
  [ ] Validate: `cat {file} | python3 -m json.tool` (or `jq . {file}`)
  [ ] Show the offending line if detectable
  [ ] Ask user to fix and retry
```

### FAIL-SLOT-UNRESOLVED
```
ERROR: Slot {{SLOT_NAME}} could not be resolved
Cause: .env file missing, slot not defined in source, or wrong environment.
Recovery:
  [ ] Check source: {authoritative_source} (see slot-convention.md)
  [ ] Use safe default: {default_value} and log WARN "using default for {{SLOT_NAME}}"
  [ ] Ask user to define the value in {authoritative_source}
```

### FAIL-GIT-OPERATION
```
ERROR: Git operation failed: {operation}
Cause: Uncommitted changes, wrong branch, or merge conflict.
Recovery:
  [ ] Show git status: `git status` and `git diff --stat`
  [ ] If uncommitted changes: stash (`git stash`) or commit before retrying
  [ ] If merge conflict: resolve conflicts in listed files, then retry
  [ ] If wrong branch: `git checkout {correct_branch}` and retry
```

---

## Usage Guide

**When to reuse a template**: When the failure mode matches one of the 11 above. Adapt `{placeholders}` to the specific phase context.

**When to write a custom block**: When the failure mode is domain-specific (e.g., authentication failure, rate limiting, schema migration error). Follow the canonical format above.

**When to escalate**: If all recovery options fail and skill returns `Status: BLOCKED`, always surface the full IF FAILS output to the user — never fail silently.

**Extending the library**: Propose additions via `/sdd-new if-fails-library-extension` if a new failure mode appears in ≥ 3 skills.
