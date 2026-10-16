<!--
  spec-driven-development preset — command contribution.
  Composed with strategy: "prepend", so this sits AFTER the command's YAML
  frontmatter and BEFORE its own steps.
  Contract: this contribution only ADDS rules. It never removes, reorders, or
  overrides any step the core command defines.
-->

## Section integrity (mandatory)

**The resolved template is this artifact's contract.** A preset appends required sections to
`spec-template` in this project. Those appended sections are exactly as mandatory as the core
ones — do not treat them as optional scaffolding.

1. Materialise the resolved template **before writing anything**:
   `bash .specify/scripts/bash/resolve-template.sh spec-template > <SPEC_FILE>`
2. Fill that file **in place**. Edit it — do not write the spec from scratch.
3. **Do not drop, rename, reorder, or summarise any section the resolved file contains**,
   including the sections that appear *after* the core ones (Document Status, Normative Status,
   Requirements Syntax (EARS), Carried Forward, Problem, Goals, Non-Goals, Dependencies and
   External Contracts, MVP Scope, Future Work, Validation Plan, Requirement Traceability).

If a section genuinely does not apply, keep its heading and write
`Not applicable — <reason>`. A generated spec missing preset sections is a defect, not a
simplification.

### Document Status goes directly after the core metadata

The resolved template appends a `Document Status` section, but it belongs **immediately after the
core metadata block** (`Feature Branch` / `Created` / `Status` / `Input`) — not where the section
lands at the end. Move it there as you fill the spec.

**Do not add a second status field.** The core `**Status**` field is the lifecycle state; this
section defines its values and records the approval metadata. Two status fields will eventually
disagree, and a reader will not know which to believe.

Fill every field — status, status-changed date, approver, authority, workflow, companion. Do not
leave them blank or write `TBD`. An unfilled status is worse than none: it implies the question was
considered and left open.

## Step rules

### Choose the workflow first

State, in one line, which workflow this request needs — **before** producing the spec. Full
specification is warranted when the change introduces user-visible behaviour, affects several
components, changes a data model or external contract, touches auth / authorisation / billing /
privacy / security / migrations, has unclear product behaviour, or carries significant
operational, reliability, or cost implications.

If the request is really a small, well-understood change, **say so and stop** — do not
manufacture ceremony for it.

### Reason about the product

Establish the problem, affected users or systems, goals, **non-goals**, MVP scope versus later
work, assumptions, and open questions. Prefer the simplest solution that satisfies the need.
The appended template sections exist for exactly this; fill them rather than skipping them.

### Ask only what materially matters

Ask a question only when the answer would change user-visible behaviour, scope, architecture,
security, privacy, data handling, external contracts, cost, delivery feasibility, or
acceptance criteria. Otherwise make a reasonable assumption, **record it in Assumptions**, and
continue. A question whose answer changes nothing is noise.

### Record assumptions — never invent requirements

Every inference you make goes in Assumptions. Do not invent a requirement to fill a gap. An
invented requirement is worse than a recorded assumption, because it looks decided.
