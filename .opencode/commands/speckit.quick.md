---
description: Fast lane for small, well-understood work — no spec/plan/tasks artifacts. For anything larger, use /speckit instead.
---

# /speckit.quick — the fast lane

Use only when the change is **small, well-understood, and reversible**. If it is not, stop and run
`/speckit` to enter the full workflow. The lane exists to be left when it stops fitting.

## 1. State the cause or the intent in two lines

If you cannot, it is not fast-lane work — go to `/speckit`.

## 2. For a defect, write the failing test first

The test must **fail for the stated reason** before you touch the fix. A fix without a failing test
is a guess that happens to compile.

## 3. Make the smallest change

Only what makes the test pass. No adjacent refactors, no "while I'm here", no new dependencies
unless the change cannot work without one (and then it is not fast-lane work).

## 4. Run the recorded verification

Run `./scripts/verify`, or the command in the `## Commands` block of `AGENTS.md`. State what you ran
and what it showed. If there is no recorded command, say so rather than inventing one.

## 5. Append one entry to `specs/quick-log.md`

```markdown
## 2026-10-17 — <one-line summary>
Evidence: <command> -> <result>
Parked: <anything noticed but not done, or "none">
```

The log entry is the only artifact. Do not create `spec.md`, `plan.md`, or `tasks.md`.

## 6. If the change grew, stop and promote

If the change is no longer small — more than one component, a new dependency, a schema or contract
change, unclear behaviour, or anything irreversible — **stop** and run `/speckit.specify` with what
you have learned. Do not finish a medium change here. Completing one silently is the failure mode
this lane's promotion rule prevents.

## Non-negotiables (inherited)

Approval gates still apply: pause before anything irreversible, external, costly, or destructive.
Evidence still applies: never report done because the code compiles. Repair at the source: if the
change reveals an earlier artifact is wrong, fix the earliest one, do not patch downstream.
