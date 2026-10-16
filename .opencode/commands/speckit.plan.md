---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
handoffs:
- label: Create Tasks
  agent: speckit.tasks
  prompt: Break the plan into tasks
  send: true
- label: Create Checklist
  agent: speckit.checklist
  prompt: Create a checklist for the following domain...
scripts:
  sh: .specify/scripts/bash/setup-plan.sh --json
  ps: .specify/scripts/powershell/setup-plan.ps1 -Json
  py: .specify/scripts/python/setup_plan.py --json
---


<!-- Source: spec-driven-development -->
<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend" (after frontmatter, before the command's steps).
  Contract: adds rules only. Never removes, reorders, or overrides the core command.
-->

## Section integrity (mandatory)

**The resolved template is this artifact's contract.** A preset appends required sections to
`plan-template` in this project. Those appended sections are exactly as mandatory as the core
ones — do not treat them as optional scaffolding.

1. Materialise the resolved template **before writing anything**:
   `bash .specify/scripts/bash/resolve-template.sh plan-template > <PLAN_FILE>`
2. Fill that file **in place**. Edit it — do not write the plan from scratch.
3. **Do not drop, rename, reorder, or summarise any section the resolved file contains**,
   including the sections after the core ones (Carried Forward, Scope Confirmation, Repository
   Findings, Architecture Overview, Major Components, Data Flow, Interfaces and Contracts,
   Dependencies, Error Handling, Security and Privacy, Performance and Reliability,
   Validation Strategy, Alternatives Considered, Risks and Mitigations,
   Requirement-to-Design Traceability, Implementation Boundaries).

If a section genuinely does not apply, keep its heading and write
`Not applicable — <reason>`. A generated plan missing preset sections is a defect.

## Step rules

### Inspect the repository before proposing anything

Read the code **before** designing against it: repository structure, the components this
change touches, their existing tests, and the project's conventions.

Fill **Repository Findings** from that inspection, not from expectation.

### Sweep before you list

A new block, field, entity, or enum member almost always appears in **more than one place**.
Search the repository for every occurrence of the concept — not just the obvious component.
Check at least:

- the schema or definition
- **any layer that enumerates the same set** — a validation schema (Zod, JSON Schema), a type
  union, a literal enum, a registry, a route table
- the component or handler
- the renderer or dispatch site
- existing tests and fixtures

A file that re-lists the same set MUST be updated too, or the build fails on the new value —
and it fails *late*, at implementation or typecheck. Name those files explicitly.

### The repository is evidence, not a blank slate

Never assume a new architecture is preferable to the existing one. Reconcile the design with
what is there. If the code contradicts the spec, repair the spec first — do not design around
a contradiction.

### Research the unknowns — go to the primary source

Research only to resolve a `NEEDS CLARIFICATION`, or to verify external behaviour the design leans
on — not to survey the topic. A design that depends on how a library, API, or tool actually behaves
must confirm it, not assume it; the wrong assumption surfaces at implementation, if at all.

- **Go to the primary source.** Official documentation, the specification, the source code, or the
  maintainer's own statement. A blog, tutorial, or Q&A may point you there; it is not the evidence.
- **Corroborate, do not count.** Ten posts repeating one benchmark are one source. Prefer the single
  primary source over many secondary ones.
- **Trace the claim, and date it.** Follow it to its origin and record the version it applies to.
  "X does Y" is unverified without a version for a fast-moving dependency.
- **Never cite what you did not open.** Record the URL — or `file:line`, for a claim about this
  codebase — for every finding. An uncited finding is a guess, not a finding.
- **Record disagreement, do not average it.** When sources conflict, note the conflict and the
  boundary between them; the boundary is often the real answer.

Record findings in `research.md`; carry whatever remains open into the plan's Open Questions.

### Stop at the approval gate

Present the plan and **stop**. Do not begin implementation from this step.



## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Pre-Execution Checks

**Check for extension hooks (before planning)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_plan` key
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently

## Outline

1. **Setup**: Run `.specify/scripts/bash/setup-plan.sh --json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Re-evaluate Constitution Check post-design

## Mandatory Post-Execution Hooks

**You MUST complete this section before reporting completion to the user.**

Check if `.specify/extensions.yml` exists in the project root.
- If it does not exist, or no hooks are registered under `hooks.after_plan`, skip to the Completion Report.
- If it exists, read it and look for entries under the `hooks.after_plan` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue to the Completion Report.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Mandatory hook** (`optional: false`) — **You MUST emit `EXECUTE_COMMAND:` for each mandatory hook**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    After emitting the block above you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id shown above, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Completion Report

Command ends after Phase 1 design. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Define interface contracts** (if project has external interfaces) → `/contracts/`:
   - Identify what interfaces the project exposes to users or other systems
   - Document the contract format appropriate for the project type
   - Examples: public APIs for libraries, command schemas for CLI tools, endpoints for web services, grammars for parsers, UI contracts for applications
   - Skip if project is purely internal (build scripts, one-off tools, etc.)

3. **Create quickstart validation guide** → `quickstart.md`:
   - Document runnable validation scenarios that prove the feature works end-to-end
   - Include prerequisites, setup commands, test/run commands, and expected outcomes
   - Use links or references to contracts and data model details instead of duplicating them
   - Do not include full implementation code, model/service/controller bodies, migrations, or complete test suites
   - Keep this artifact as a validation/run guide; implementation details belong in `tasks.md` and the implementation phase

**Output**: data-model.md, /contracts/*, quickstart.md

## Key rules

- Use absolute paths for filesystem operations; use project-relative paths for references in documentation
- ERROR on gate failures or unresolved clarifications

## Done When

- [ ] Plan workflow executed and design artifacts generated
- [ ] Extension hooks dispatched or skipped according to the rules in Mandatory Post-Execution Hooks above
- [ ] Completion reported to user with branch, plan path, and generated artifacts