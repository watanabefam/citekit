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

### When the core template itself marks a section removable

The core template carries headings like `# [REMOVE IF UNUSED] Option 2: Web application`. Those
markers are part of the resolved file, so the rule above and the markers can appear to disagree.
They do not, and the markers win **for the sections they mark**:

- A section the core template marks removable **may** be removed. Removing it is not a dropped
  section, and the conformance check (`scripts/check-section-integrity.sh`) skips any heading
  containing `[` for exactly this reason.
- Every **appended** section carries no removal marker and therefore **always stays**.
- Where removing an optional section would leave a gap, keep the pattern rather than leaving
  silence: state the choice in the nearest required section (for a removed architecture option,
  say which option this project uses and why, in `Scope Confirmation`).

Do not read "the markers win" as licence to delete an appended section. The markers appear only in
the core template; if a heading contains no `[`, it is required.

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
