---

<!--
  Appended by the spec-driven-development preset (strategy: append).
  The core task format above (phases, [P] markers, [Story] labels, checkpoints,
  dependency ordering) remains authoritative. This addendum adds the per-task detail
  block that makes each task traceable and independently verifiable.
-->

## Task Detail Block

The checkbox lines above give the plan. For any task that is not trivial, expand it using
this block. The point is that each task states **why it exists** and **how you will know it
is done** — not just what to edit.

```markdown
## T003: [Task Name]

- **Objective**: What this task achieves, in one line.
- **Addresses requirement(s)**: FR-004
- **Implements design decision(s)**: Where the design said this belongs.
- **Depends on**: T001, T002
- **Likely files**: Path or component, without guessing every file.
- **Scope boundaries**: What must NOT change while doing this.
- **Expected output**: Observable result.
- **Verification**: The exact command or check that proves it works.
- **Completion conditions**: What must be true to tick this off.
- **Risks / rollback**: What could go wrong, and how to undo it.
```

### Worked example

```markdown
## T003: Reject expired invitations during acceptance

- **Objective**: Reject expired invitations at acceptance time.
- **Addresses requirement(s)**: FR-004
- **Implements design decision(s)**: Validation happens in the service layer.
- **Depends on**: T001, T002
- **Likely files**: invitation service, invitation acceptance tests
- **Scope boundaries**:
  - Do not change the invitation expiry duration.
  - Do not alter email delivery.
- **Expected output**:
  - Expired invitations return the defined error.
  - Valid invitations continue to work.
- **Verification**: unit test for expired invitation; regression test for valid invitation.
- **Completion conditions**: tests pass; FR-004 acceptance criteria satisfied.
- **Risks / rollback**: Reversible by reverting the service-layer change; no migration.
```

## Task Rules

- Order tasks by dependency; keep them small enough to review in one pass.
- Put tests next to the behaviour they verify, not in a trailing phase.
- Every task traces to a requirement or an approved design decision.
- Do not create tasks for unapproved future work.
- Distinguish implementation, test, migration, documentation, and validation work.
- State the evidence that marks a task complete.
- Identify migrations and sequencing constraints explicitly.

## Property-Based Test Tasks

If `plan.md` carries a **Correctness Properties** table, every property gets exactly one
property-based test task.

- **One task per P-ID.** A property with no task is unbuilt. Do not batch several properties into
  one task — a failing property must point at a single task.
- **Trace both IDs.** Each such task states its `P-xxx` **and** the `FR-xxx` the property maps to,
  so a failure is traceable back to a requirement.
- **Name the framework the plan recorded — never one of your own choosing.** The plan's Framework
  decision is authoritative. Do not hardcode a framework name, and do not add a dependency the
  plan did not decide on.
- **Follow the fallback verbatim.** If the plan decided `fallback`, write example-based tests and
  say why in the task. Do not silently introduce property-based testing the plan rejected.
- **Co-locate.** A property test sits in the same phase as the story behaviour it covers — not in
  a trailing "testing" phase.

### Worked example

```markdown
## T009: Property test — expired tokens are always rejected

- **Objective**: Prove that any request with an expired token is rejected.
- **Addresses requirement(s)**: FR-004 (P-003)
- **Implements design decision(s)**: Plan's Framework decision — `adopt`, using the framework
  the plan recorded.
- **Depends on**: T007
- **Likely files**: the property-test file for this area
- **Scope boundaries**: Do not change token expiry semantics; test only.
- **Expected output**: Property `for any expired token, the response is 401`.
- **Verification**: the property test runs and passes; then break the guard and confirm it fails.
- **Completion conditions**: P-003 passes, and the property fails when the behaviour is removed.
- **Risks / rollback**: Test-only; revert the file.
```

A property test that cannot fail is not evidence. If removing the behaviour does not fail the
property, the property is wrong — fix the property before trusting it.

## Requirement Coverage

A requirement with no task is unbuilt. A task with no requirement is scope creep. Check
before starting, not after. Every property from `plan.md` appears here too: a P-ID with no task is
unbuilt, and a property-test task with no P-ID is scope creep.

| Requirement | Property | Tasks | Covered? |
| --- | --- | --- | --- |
| FR-001 | P-001 | T002, T004 | ☐ |
| FR-002 | — (opt-out: *reason*) | T005 | ☐ |
