---

<!--
  Appended by the spec-driven-development preset (strategy: append).
  The core constitution above remains authoritative for project-specific values.
  These principles supplement it and are applied when /speckit.constitution runs.
-->

## Delivery Principles

### I. Product Intent and Scope

Every material change must identify the user or system problem it addresses, its goals, its
non-goals, and its intended scope.

### II. Evidence Before Implementation

When product behaviour or feasibility is uncertain, investigate the repository, the relevant
evidence, and available solution patterns before selecting an approach.

### III. Explicit Assumptions

Assumptions that could affect behaviour, scope, architecture, security, data, cost, or
validation must be recorded.

### IV. Verifiable Outcomes

Requirements must be testable or otherwise verifiable. Acceptance criteria must describe
observable outcomes.

### V. Traceable Delivery

Each implementation task must trace to an approved requirement or design decision.

### VI. Controlled Change

Material changes to approved behaviour, scope, architecture, security, data, or cost require
explicit review.

### VII. Artifact Consistency

When a later discovery contradicts an earlier artifact, repair the earliest affected
artifact and re-check the artifacts that depend on it.

### VIII. Proportional Process

Use enough process to control risk, but do not apply full product discovery to routine
maintenance or small, well-understood fixes.
