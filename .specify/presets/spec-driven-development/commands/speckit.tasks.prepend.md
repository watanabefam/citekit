<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend" (after frontmatter, before the command's steps).
  Contract: adds rules only. Never removes, reorders, or overrides the core command.
-->

## Section integrity (mandatory)

**The resolved template is this artifact's contract.** A preset appends required sections to
`tasks-template` in this project. Those appended sections are exactly as mandatory as the core
ones — do not treat them as optional scaffolding.

1. Materialise the resolved template **before writing anything**:
   `bash .specify/scripts/bash/resolve-template.sh tasks-template > <TASKS_FILE>`
2. Fill that file **in place**. Edit it — do not write the task list from scratch.
3. **Do not drop, rename, reorder, or summarise any section the resolved file contains**,
   including the sections after the core ones (Task Detail Block, Task Rules,
   Requirement Coverage).

Keep the core `- [ ] T00x [P?] [USn?]` task-line format exactly. The appended Task Detail Block
is what makes a task traceable and independently verifiable — do not replace it with a bare
checklist.

If a section genuinely does not apply, keep its heading and write
`Not applicable — <reason>`. A generated task list missing preset sections is a defect.

## Step rules

### Every task traces to a requirement

A requirement with no task is unbuilt. A task with no requirement is scope creep. Complete the
**Requirement Coverage** table **before** starting work, not after — every functional
requirement accounted for, including any deliberately opted out (name the opt-out and why).

### One task, one verifiable outcome

Each non-trivial task carries its own Objective, requirement link, scope boundaries, and a
**runnable Verification** line. If you cannot state how a task will be verified, it is not yet
a task — it is an intention.

### Control scope

Do not create tasks for unapproved future work, convenience features, or broad refactors that
correctness does not require. If it is not traceable to an approved requirement or design
decision, it does not get a task.
