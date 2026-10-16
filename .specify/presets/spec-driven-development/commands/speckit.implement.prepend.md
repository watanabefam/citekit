<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend" (after frontmatter, before the command's steps).
  Contract: adds rules only. Never removes, reorders, or overrides the core command.
-->

## Step rules

### Implement only approved work

Execute the tasks as written. Do not add features, scope, or refactors that nobody approved —
including ones that look obviously helpful. "Helpful" is not the same as "approved".

### Park out-of-scope ideas — do not act on them, do not drop them

When you notice something worth doing that is not in the approved tasks — a bug in an adjacent
file, an obvious improvement, a refactor that would make this cleaner — **write it in the spec's
`Future Work (parking lot)` table and continue the task you were on.**

Do not implement it, even if it is one line. Do not silently drop it, even if it is minor. An
unrecorded idea is indistinguishable from one that was never had, and the person reviewing your
work cannot tell the difference.

This is not a prohibition on noticing things. It is a requirement to record them where they can be
found, instead of smuggling them into a change nobody approved.

### Evidence before "done"

You may **not** mark a task or feature complete because the code compiles, a single test
passes, a file was edited, or the implementation looks correct.

Mark a task complete only against the evidence its **Verification** line names. State what you
ran and what it showed. If something could not be verified, say so plainly rather than
implying it passed.

### Tick tasks honestly, as you go

Transition `- [ ]` to `- [x]` in `tasks.md` as each task actually completes. If a task could
not be completed — missing credentials, an external dependency, an environment you do not
have — **leave it unticked and say why**. Never tick a box to make the list look finished.

### Keep a progress ledger — conversation memory does not survive compaction

`specs/<NNN>-<slug>/progress.md` is the plan's resume ledger. Todos ticked in `tasks.md` do not
survive context loss: a later session that lost its place will re-do completed work unless the
ledger records it. Write to the ledger **as each task finishes**, never only at the end.

**First line — identity.** Name the plan and (if in one) the branch:

```
# Progress — plan: specs/001-add-greeting/plan.md
# Resume rule: a task is DONE iff it has a `Task <N>: complete` line. Resume at the first
#   task without one. If the ledger names a different plan, archive it and start fresh —
#   never merge two plans' ledgers.
```

**One line per completed task, with evidence.** Ticking the box in `tasks.md` is a claim;
the ledger line is the checkpoint because it carries what a resumed agent can re-verify:

```
Task 1: complete (commits a1b2c3d..e4f5a6b — node -e "greet('x')" -> "Hello, x")
Task 2: fix round 2/3 (1 addressed, 1 open — off-by-one at edge; commits f3a2b1c..)
```

Include the commit range or artifact, and what you ran. A line without evidence is a
claim, not a checkpoint.

**Record rulings as you make them.** When reality contradicts the plan and you decide how to
resolve it (after repairing the earliest artifact), append a ruling so the rationale survives:

```
Ruling: converted month field to 1-based — UI sends 1-based; plan assumed 0-based — if the
API consumers are 0-based, dates shift by one
```

**At the start of a session, read the ledger first.** Check the identity line, resume at the
first task without a `complete` line, and re-verify the named commits with `git log` before
trusting them.

### If reality contradicts the plan

Stop. Explain the contradiction, identify the **earliest** affected artifact (spec before plan,
plan before tasks), repair that artifact, and re-check what depends on it. Do not patch a
downstream artifact while leaving the cause upstream — that is how artifacts drift apart.

If the repair changes scope, behaviour, architecture, security, data, or cost, surface it for
approval rather than proceeding.
