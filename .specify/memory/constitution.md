# citekit Constitution

Brownfield constitution derived from what the repository actually does. Each principle states a
rule, why it exists (from the evidence), and which future specs it governs.

## Core Principles

### I. No Secrets in the Repository (MUST)
No API key, token, or credential may be written into a tracked file. Keys live in exactly two places:
the browser's `localStorage`, entered by the user, or the Worker as encrypted secrets
(`wrangler secret put`); `.gitignore` blocks `.env`, `*.dev.vars`, and friends.
- **Why**: the repository is shared and public; a committed key is a durable liability, and the
  `.gitignore` patterns exist precisely so one cannot be committed by accident.
- **Influences**: settings/UI specs, proxy and MCP specs, any feature that handles credentials or
  configuration files, and review checklists for every change.

### II. User-Key Custody — BYOK (MUST)
A user's model key leaves the browser only in a request to the provider the user selected; never to a
server the project owns. Node tools and the MCP server take keys from the environment, not argv.
- **Why**: browser-direct BYOK with no backend is the product's trust model, and process arguments are
  readable by every local user.
- **Influences**: LLM provider adapter specs, telemetry/logging manifests, the MCP server spec, and any
  proposed server-side component.

### III. Proxy Boundary Discipline (MUST)
Any CORS proxy must treat the **target-host allowlist as the real boundary**, add an origin allowlist,
support an optional shared secret, answer the preflight at the edge (never proxy `OPTIONS`), never
reflect `Origin` unconditionally, and strip `Set-Cookie` plus `Origin`/`Referer`/`CF-*` headers on the
way through.
- **Why**: without a target allowlist the Worker is a general-purpose open relay; this was designed in
  from Cloudflare's own example plus the safety rules that example leaves to the implementer.
- **Influences**: proxy specs, any new source adapter that needs a proxy hop, and the deployment spec.

### IV. Deterministic, Explainable, Citation-Anchored Answers (MUST)
Ranking and selection are deterministic term-frequency scoring with no embeddings by default; citation
numbers are assigned **before** the model runs and the source list is rendered from the same array;
signals without evidence (cross-source consensus, recency) are excluded from the score.
- **Why**: determinism is reproducible and explainable, and pre-assigned citation numbers make a
  hallucinated `[7]` in a five-source answer visibly wrong.
- **Influences**: ranking and retrieval specs, evaluation specs, and any prompt-construction change.

### V. Evidence Before Claim (MUST)
No metric, ranking effect, or API behaviour may be stated in code, comments, or prose unless it was
probed or tested. Vary the single variable believed responsible and repeat before naming a cause. A
green headless run is not browser-callability.
- **Why**: twice a plausible mechanism was wrong ("consensus is a quality signal", "CORE's 429 is
  caused by the browser `Origin` header") and each had to be unwound from both code and README.
- **Influences**: every spec and plan that makes a feasibility, cost, or performance claim; README and
  documentation updates; evaluation methodology.

### VI. One Shipping Implementation (MUST)
Tools, tests, and the MCP server run `index.html`'s real shipping `<script>` through the shared
`tools/load-ll.mjs` loader. There is no second implementation of the pipeline to drift out of sync.
- **Why**: a re-implementation is how the CLI and MCP server would silently diverge from the app.
- **Influences**: CLI, tooling, and MCP specs; any proposal to extract or duplicate pipeline logic.

### VII. Re-runnable, Unmocked-at-the-HTTP-Layer Verification (SHOULD)
Every behaviour change ships with a re-runnable assertion in `tests/`, exercised against real upstream
APIs or the real runtime (workerd, Chromium, MCP stdio) rather than an HTTP mock. Assertions live
alongside the code they verify.
- **Why**: the repository's confidence rests on scripts that reproduce without manual steps, and the
  live runs have caught defects (e.g. a duplicate-collapse bug) a stub could not.
- **Influences**: acceptance criteria in every feature spec, and the definition of "done".

### VIII. Static, Dependency-Minimal Delivery (SHOULD)
Keep the app a single HTML file with no build step and no runtime dependencies; Node scripts use the
standard library and global `fetch` (Node 18+). Add a dependency only when the value clearly exceeds
the cost to portability and reproducibility.
- **Why**: "one file you control end to end" is the product's reason to exist; zero dependencies is a
  deliberate, stated choice in the MCP server and CLI.
- **Influences**: dependency-selection, build-tooling, and architecture specs; framework or bundler
  proposals.

### IX. Stable Public Contracts (SHOULD)
Treat `window.LL`, the `ll.*` `localStorage` keys, the MCP tool names/schemas, the proxy request
contract, and the `[n]`/`[n, p.4]` citation format as public interfaces: change them only with a
migration note and updated tests. Legacy names are kept on purpose.
- **Why**: renaming `ll.*` keys or `window.LL` would orphan saved libraries and churn every test, and
  agents/clients depend on the MCP tool surface.
- **Influences**: refactor and interface specs, migration planning, and the skill/MCP contracts.

## Delivery Principles

I. Product Intent and Scope — Every material change must identify the user or system problem it addresses, its goals, its non-goals, and its intended scope.
II. Evidence Before Implementation — When product behaviour or feasibility is uncertain, investigate the repository, the relevant evidence, and available solution patterns before selecting an approach.
III. Explicit Assumptions — Assumptions that could affect behaviour, scope, architecture, security, data, cost, or validation must be recorded.
IV. Verifiable Outcomes — Requirements must be testable or otherwise verifiable. Acceptance criteria must describe observable outcomes.
V. Traceable Delivery — Each implementation task must trace to an approved requirement or design decision.
VI. Controlled Change — Material changes to approved behaviour, scope, architecture, security, data, or cost require explicit review.
VII. Artifact Consistency — When a later discovery contradicts an earlier artifact, repair the earliest affected artifact and re-check the artifacts that depend on it.
VIII. Proportional Process — Use enough process to control risk, but do not apply full product discovery to routine maintenance or small, well-understood fixes.

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17

Governance: This constitution supersedes other practice; amendments require a documented change to this file and a re-check of the artifacts that depend on it, and any conflict is resolved in favour of the principle most grounded in the repository's evidence.
