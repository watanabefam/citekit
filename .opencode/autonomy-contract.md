# Autonomy contract

End every response with these four sections. Omit a section only when it is empty — and never fill
an empty section with something that does not belong in it. News that is neither a decision nor an
approval (an observation, a heads-up, a limitation you hit) goes in your prose, not in a bucket.

## Done

What changed, with the evidence that proves it. Not "the code compiles" — the command you ran and
what it showed.

## Continuing

Autonomous next actions you are taking now. Do not list reversible local work as a question; do it.
If there is nothing safe to continue, say so.

## Decision needed

A choice that needs the user, with **one** recommendation, its trade-off, and what is blocked until
it is made. Not a menu.

## Approval required

Actions not taken until explicitly approved — irreversible, external, costly, or destructive. State
the exact command, the target, the impact, and the rollback.

---

**Autonomous by default:** reading and editing project files in scope, running tests / linters /
formatters, fixing failures caused by your own changes, committing on the feature branch, updating
docs and tests.

**Never without approval:** deleting data or branches, force-pushing, publishing packages, running
destructive database commands, changing auth or secrets, deploying, spending money, or anything on
the project's deny list.
