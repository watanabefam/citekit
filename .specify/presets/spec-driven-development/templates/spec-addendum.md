---

<!--
  Appended by the spec-driven-development preset (strategy: append).
  The core sections above remain authoritative and unchanged. These sections add
  problem framing and traceability that the core template does not carry.
-->

## Document Status

**Place this block immediately after the core metadata block** (the `Feature Branch` / `Created` /
`Status` / `Input` lines), not at the end where this section lands.

The core template already carries a `**Status**` field. **Do not add a second status field** — two
status fields will eventually disagree, and a reader will not know which one to believe. This
section *defines* the core field's lifecycle and records the approval metadata the core does not ask
for.

**Lifecycle for the core `Status` field** — an open set, in the manner of MADR (Markdown
Architectural Decision Records), which deliberately does not standardise a closed enum:

`Draft` → `Accepted` → `Deprecated` | `Superseded by <id>`

`Draft` means not yet agreed; `Accepted` means in effect and safe to rely on; `Deprecated` means
discouraged but not replaced; `Superseded by <id>` means replaced, and must name its replacement.
**Never edit a superseded spec, and never reuse an id.**

Record the remaining metadata here:

```
**Status changed:** YYYY-MM-DD (last status change)
**Approved by:** <who> · **Authority:** <what authorised it>
**Workflow:** <full spec-driven | short path> · **Companion:** <path, or "none">
```

Approval is **three separate facts** — who, when, and under what authority. Do not collapse them
into the status word: `Accepted` does not say who accepted it, or why they were entitled to. This is
the field a reader needs when asking "can I rely on this?", so it has to answer that.

## Normative Status

A specification has two kinds of content, and conflating them is how specs become untestable.

- **Normative** — binds conformance. A requirement here is one an implementation can be judged
  against, pass or fail.
- **Informative** — assists understanding. Rationale, background, examples, and notes.

This distinction is standard, not stylistic: ISO/IEC Directives Part 2 §3.2 defines it, the W3C QA
Framework requires a spec to state how the two are distinguished, and IETF practice splits
references into normative and informative. Two rules follow, and both are checkable:

1. **Requirements live only in normative sections.** ISO/IEC is explicit that notes and examples
   "shall not contain requirements" — they are always informative. Do not smuggle a requirement into
   a note, an example, or a comment. A reader who skips the informative material must still be able
   to build the right thing.
2. **Normative keywords do not appear in informative sections.** If a rationale section says
   "the system SHALL…", either it is a requirement that belongs above, or the wording is wrong.
   Avoid language that *sounds* binding outside the normative sections.

**State the boundary in the document.** Say which sections are normative. Silence leaves the reader
to guess, and the guess is usually that everything binds.

### Which document wins

When a companion document exists — research notes, a design rationale, a brief — declare the
authority relationship explicitly and **with a dated reference**:

> This spec is authoritative for behaviour. `<companion path>` is informative: it carries research
> and rationale, and where the two disagree, this spec prevails.

There is no automatic precedence between two documents. ISO, W3C, and IETF all require the
relationship to be stated (a dated reference fixes the version; an undated one floats and will
eventually contradict you). A companion document that is not labelled informative will be read as
competing with the spec, and nobody will know which one to follow.

## Requirements Syntax (EARS)

Every functional requirement is written in **EARS** (Easy Approach to Requirements Syntax). EARS
constrains free-form prose into a small set of testable shapes, so a reviewer can write an
acceptance check from the requirement text alone.

**Use `SHALL` for every required behaviour — never MUST, SHOULD, or a bare lowercase verb.**
`SHALL` is the only normative keyword here (RFC 2119 sense). Mixing in MUST, or writing "the
system validates…", leaves it ambiguous whether the behaviour is binding.

**But do not `SHALL` everything.** RFC 2119 §6 is explicit that these keywords "must be used with
care and sparingly", and "must not be used to try to impose a particular method on implementors
where the method is not required for interoperability." A requirement that merely describes how
something happens to work is informative — write it as prose. Reserving `SHALL` for behaviour that
actually binds is what keeps the word meaningful; a spec where every sentence is `SHALL` has
abolished the distinction it was trying to make.

| Pattern | Keyword | Shape | Use when |
| --- | --- | --- | --- |
| Ubiquitous | *(none)* | `THE <system> SHALL <response>` | the behaviour is always active |
| Event-driven | `WHEN` | `WHEN <trigger> THE <system> SHALL <response>` | a response is required to a triggering event |
| State-driven | `WHILE` | `WHILE <state> THE <system> SHALL <response>` | the behaviour holds while a state is true |
| Optional feature | `WHERE` | `WHERE <feature is included> THE <system> SHALL <response>` | it applies only to variants that include a feature |
| Unwanted behaviour | `IF` / `THEN` | `IF <unwanted condition> THEN THE <system> SHALL <response>` | a response is required to a fault, failure, or undesired situation |

Examples:

- **Ubiquitous** — `THE <system> SHALL prevent concurrent edits to the same record.`
- **Event-driven** — `WHEN a request carries an expired token, THE <system> SHALL reject it with an authentication error.`
- **State-driven** — `WHILE a sync is in progress, THE <system> SHALL queue further writes.`
- **Optional feature** — `WHERE audit logging is enabled, THE <system> SHALL record the acting user.`
- **Unwanted behaviour** — `IF the upstream service is unavailable, THEN THE <system> SHALL retry with backoff and report a degraded status.`

**Clause order is fixed** and follows temporal logic: preconditions (`WHILE`, `WHERE`) precede
the trigger (`WHEN`), which precedes the system response. Requirements that combine keywords are
**complex** — e.g. `WHILE <state>, WHEN <trigger>, THE <system> SHALL <response>`. Use the fewest
clauses that work; if a requirement needs more than three, split it.

**Common misuse:** `WHEN` is for an event, not a state; `WHILE` is for a state, not an event;
`IF…THEN` is for unwanted behaviour and is evaluated on the second pass — do not use it for the
normal path; `WHERE` denotes a variant, not a location.

This guidance is deliberately **language-agnostic**. The property-based testing framework (if any)
is decided per project in `plan.md`. Do not hardcode a framework (e.g. Hypothesis) into a
requirement.

## Carried Forward

Summary of what this artifact inherits from the work before it. Keep it short — it is a
handoff, not a retelling.

### Confirmed Decisions

- [Decision already settled by the user or by earlier evidence]

### Constraints

- [Constraint that limits the solution space]

### Assumptions

- [Assumption being carried in; becomes a risk if it is wrong]

### Risks

- [Known risk, and how it would show up]

### Open Questions

- [Unresolved item that affects behavior, scope, architecture, or acceptance]

## Problem / Opportunity

[What problem or opportunity exists, for whom, and why does it matter now? If this is not a
real problem, the feature should not be built.]

## Goals

- [Outcome this feature is meant to produce]

## Non-Goals

- [Explicitly **not** being solved here. Prevents silent scope expansion.]

## Dependencies and External Contracts

- [Service, API, data source, schema, or external contract this feature depends on, and what
  happens if it changes]

## MVP Scope

[The smallest slice that delivers the value of the highest-priority user story. Everything
else is Future Work.]

## Future Work (parking lot)

Deliberately deferred. Not part of this feature's acceptance criteria. Must not be implemented
without explicit approval.

This section is also the **parking lot**: the place an out-of-scope idea goes the moment you notice
it, so it is neither acted on nor lost. Scope control without somewhere to put the idea produces one
of two failures — silent scope creep, or an idea that gets dropped and never seen again. Parking is
the door in the wall.

**Capture, do not act.** When you notice something worth doing that is not in the approved scope:
write it here, and continue the task you were on. Do not implement it because it is small, obvious,
or adjacent. Do not silently drop it either — an unrecorded idea is indistinguishable from one that
was never had.

| # | Idea | Noticed during | Why deferred | Revisit when |
| --- | --- | --- | --- | --- |
| 1 | | | | |

- **Noticed during** — the phase or task where it surfaced. Useful context when it comes back.
- **Why deferred** — one line. "Not this feature" is acceptable; unstated is not.
- **Revisit when** — a trigger: after this ships, when the schema changes, if users ask. A parked
  idea with no revisit condition is just a nicer way of losing it.

### Parking lot vs Non-Goals

They are different, and conflating them hides work:

- **Non-Goals** are decided **upfront** — deliberately excluded from this feature, on purpose.
- **The parking lot** is noticed **in passing** — not yet decided, just not now.

A Non-Goal is a decision. A parked idea is a deferral awaiting one.

**Review the parking lot at close-out** (`/speckit.converge`) and at each phase boundary. Promote
an item to a spec, keep it parked with a reason, or delete it deliberately. What must not happen is
reviewing it never.

## Validation Plan

How this feature will be proven, before implementation starts.

- **Automated tests** —
- **Manual checks** —
- **Data or migration checks** —
- **Security / privacy checks** —
- **Performance checks** —
- **Evidence required for approval** —

## Requirement Traceability

Fill in as the work progresses. A requirement with no task is unbuilt; a task with no
requirement is scope creep.

| Requirement | User Story | Acceptance Criteria | Planned Design Area | Task |
| --- | --- | --- | --- | --- |
| FR-001 | US1 | Given / When / Then | | |
