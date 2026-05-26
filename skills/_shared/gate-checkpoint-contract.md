# Gate-Checkpoint Contract — Phase Execution Semantics

> Defines the formal contract for GATE IN / MUST DO / CHECKPOINT / IF FAILS within each skill phase.
> Reference this file when designing or auditing skill phase logic.

---

## The Four-Part Phase Contract

Every skill phase MUST contain all four parts, in order:

```
GATE IN    → MUST DO    → CHECKPOINT    → IF FAILS
(enter?)      (do it)      (did it work?)  (what now?)
```

---

## GATE IN — Entry Conditions

**Purpose**: Verify current state allows entering the phase. All conditions must pass.

**Format**:
```markdown
### GATE IN
- [ ] Condition 1 (must be true to enter)
- [ ] Condition 2
```

**Semantics**:
- Evaluated BEFORE any MUST DO action
- If ANY condition fails → phase is **SKIPPED** (not failed; execution continues to next phase)
- Skipped phases do NOT trigger IF FAILS
- GATE IN is ALWAYS required — even if trivial: `- [ ] Always enters`
- GATE IN conditions check **state** (files exist, artifacts ready, approvals given)

---

## MUST DO — Ordered Mandatory Actions

**Purpose**: The actions to execute within this phase. All are mandatory.

**Format**:
```markdown
### MUST DO
> ⚠️ All actions are MANDATORY

1. [ ] **Action Name** — what to do and where
2. [ ] **Action Name** — what to do and where
```

**Semantics**:
- Numbered, ordered, all mandatory
- Checkbox `[ ]` = action to perform (imperative)
- Execute sequentially; if one fails, stop and go to IF FAILS via CHECKPOINT
- No optional actions in MUST DO (optionals belong in REFERENCE)

---

## CHECKPOINT — Post-Action Verification

**Purpose**: Verify all MUST DO actions had the expected effect.

**Format**:
```markdown
### CHECKPOINT
> ✅ Verify before continuing

- [ ] Verification 1 (state that MUST be true after MUST DO)
- [ ] Verification 2
```

**Semantics**:
- Evaluated AFTER all MUST DO actions complete
- Checkbox `[ ]` = verification of state (declarative)
- If ANY fails → enter IF FAILS immediately
- CHECKPOINT failures are BLOCKING — never skip silently
- CHECKPOINT checks **outcomes** (file exists, value correct, tests pass)

---

## IF FAILS — Structured Recovery

**Purpose**: Actionable error handling when CHECKPOINT fails.

**Format**:
```markdown
### IF FAILS
> ❌ What to do when CHECKPOINT fails

ERROR: [Title — what went wrong]
Cause: [Why it happened]
Recovery:
  [ ] Option A: [Most likely to work]
  [ ] Option B: [Fallback]
  [ ] Option C: [Last resort / escalate]
```

**Semantics**:
- Triggered ONLY by CHECKPOINT failures (not GATE IN failures)
- Phase-scoped: only this phase's IF FAILS fires, not a global handler
- MUST provide ≥ 2 recovery options
- If no recovery works → skill returns `Status: BLOCKED` in Execution Summary
- For reusable blocks → see `skills/_shared/if-fails-templates.md`

---

## Cascade Rule

```
CHECKPOINT passes  →  advance to next phase's GATE IN
CHECKPOINT fails   →  enter IF FAILS
IF FAILS recovered →  re-enter CHECKPOINT (once)
IF FAILS no recovery → Status: BLOCKED, surface to user
```

---

## Phase Templates

### Discovery Phase (analyze, detect, parse)
```markdown
### GATE IN
- [ ] Input data / artifact exists

### MUST DO
1. [ ] **Read inputs** — describe what and where
2. [ ] **Parse / detect** — extract relevant information
3. [ ] **List findings** — produce structured result

### CHECKPOINT
- [ ] Result is non-empty
- [ ] All required fields extracted

### IF FAILS
ERROR: No data detected
Cause: Input empty, format unexpected, or file unreadable
Recovery:
  [ ] Verify input path and format
  [ ] If optional: proceed with empty result and log WARN
```

### Implementation Phase (write, create, modify)
```markdown
### GATE IN
- [ ] Spec / design artifact available
- [ ] Target path writable

### MUST DO
1. [ ] **Read existing** — load current file state (never overwrite blindly)
2. [ ] **Apply change** — implement per spec and design
3. [ ] **Verify output** — confirm the artifact was written

### CHECKPOINT
- [ ] Output file exists at expected path
- [ ] Content matches spec requirements
- [ ] No forbidden patterns (hardcoded values, removed lines)

### IF FAILS
ERROR: Implementation artifact missing
Cause: Write failed, path error, or disk full
Recovery:
  [ ] Check permissions: `ls -ld {dir}`
  [ ] Retry write with explicit path
  [ ] See `if-fails-templates.md` → Write-Permission-Denied
```

### Verification Phase (check, audit, validate)
```markdown
### GATE IN
- [ ] Implementation artifact exists
- [ ] Verification tool / criteria available

### MUST DO
1. [ ] **Run checks** — execute validation commands
2. [ ] **Capture results** — record pass/fail per criterion
3. [ ] **Assess verdict** — map results to CASTLE gates

### CHECKPOINT
- [ ] All mandatory criteria pass
- [ ] Evidence recorded

### IF FAILS
ERROR: Verification check failed: {check name}
Cause: Implementation does not satisfy criterion
Recovery:
  [ ] Show actual vs expected
  [ ] Return to Implementation Phase with specific finding
```

---

## Phase Transition Diagram

```
BLOCKING CONDITIONS fail  →  ABORT (surface to user)
          │
          ↓ pass
      Phase 0: Load Context
          │
          ↓
      Phase 1: GATE IN ─── fail ──► skip to Phase 2 GATE IN
          │ pass
      Phase 1: MUST DO
          │
      Phase 1: CHECKPOINT ─── fail ──► IF FAILS ─── no recovery ──► BLOCKED
          │ pass                                    └── recovered ──► re-check
          ↓
      Phase 2: GATE IN ─── fail ──► skip to Phase 3 GATE IN
          │ pass
          ↓ ...
      FINAL CHECKPOINT
          │
      Execution Summary
          │
      Phase N+1: Write Session
```
