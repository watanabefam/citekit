<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend" (after frontmatter, before the command's steps).
  Contract: adds rules only. Never removes, reorders, or overrides the core command.
-->

## Step rules

### Completion requires evidence

Do not report completion because the code compiles, a single test passes, the requested file
was edited, or the implementation appears correct.

Completion requires evidence against the **approved specification and its acceptance
criteria**. State what you ran and what it showed.

### A report that finds problems is the report working

Do not round up to green. A `Partial` or `Fail` row is not a failure of the convergence report
— it is the report doing its job. Surface deviations and decide on them rather than hiding
them behind an optimistic summary.

### Check the boundaries you declared

Verify the plan's **Must Not Change** items are actually unchanged — a diff against those files
is the evidence, not an assertion that you were careful.

### Review by a context that did not do the work

Before reporting completion, have the change reviewed in a context that did not produce it — a
subagent, or a separate session — at a depth the change warrants. Re-reading your own output is not
review: a model grading its own work is too generous, and a reviewer set to find problems will invent
them (on work a generator already handles well, a self-critique loop measurably *lowers* accuracy).
So:

- **Match the depth to the change.** A one-line fix needs a read; a security, data-path, or
  contract change needs the red team. Three passes is a ceiling, not a target.
- **Fresh context, and ideally a different model.** A reviewer that shares your context shares your
  blind spots.
- **Every finding carries evidence** — `file:line`, or a command that reproduces it. A finding with
  neither is dismissed, with the reason recorded. Adjudicate findings; do not count them.
- **Grade every finding, and stop on the grade.** CRITICAL = a false claim, unsafe or data-losing
  behaviour, or a guard that does not guard; HIGH = wrong behaviour or a broken/absent guard;
  MEDIUM = a real but contained risk; LOW = style. This grades *review findings* — the separate
  convergence-gap severity scale below is unchanged. Stop when no UNRESOLVED finding is HIGH or
  above — never because the reviewer went quiet — and report whatever is still open.
- **Prefer the deterministic check.** Where a criterion reduces to a program — a test, a gate, a
  lint — run that instead of asking a model to judge it. It is cheaper, and it cannot be talked out
  of its answer.

### Stress the properties the change asserts

A review reads the change; a stress test tries to make it fail. Only the second shows an assertion is
load-bearing.

- **Trigger on what the change asserts, not its size.** A change that asserts a behavioural property
  — a hook, a gate, a validator, a guard, an invariant — ships a stress test. A change that is prose
  with no oracle gets its reasoning probed for loopholes instead; do not fake a test for what you
  cannot test.
- **Send the negative case first.** A guard never asked to block proves nothing. Give it the input it
  must reject and confirm it rejects it — the kit's own gate asserts the no-verify guard blocks four
  bypass forms, not that the file contains `--no-verify`.
- **Keep the case that broke it.** Every input that failed the change, or bypassed it, becomes a
  permanent fixture beside the artifact — a regression corpus, not a one-off.
- **Report the evidence, not the verdict.** "Ran X; it failed; fixed with Y", not "it was tested".
  Where behaviour is non-deterministic, run it more than once and report the spread.

### Review the parking lot

The spec's `Future Work (parking lot)` is a queue, not a graveyard. At close-out, walk it and give
every item one of three outcomes:

- **promote** — it is worth doing; it becomes its own spec
- **keep parked** — with a reason and a revisit condition
- **delete** — deliberately, because it is no longer wanted

An item that gets none of these has been silently abandoned, which is the failure mode the parking
lot exists to prevent. Report the count and what happened to each.

### Close the progress ledger

When the feature is complete, tombstone `specs/<NNN>-<slug>/progress.md` rather than leaving it
looking active. Append a final block and stop writing to it:

```
# Status: complete — <YYYY-MM-DD>
# Final: spec.md, plan.md, tasks.md, progress.md reconciled
```

A ledger that still looks active will be read as authoritative by a later session that should
instead be starting fresh. Do not delete it — for committed specs, the ledger is audit trail. A
ledger for a retired plan is archived, never merged into a new one.

### Handoff discipline

Close with what changed, what remains open, what needs approval, what was verified and how, and
which downstream artifacts are affected. Do not discard earlier decisions silently: if a later
step invalidated one, say which and why.
