# Implementation Plan: OpenAIRE and ClinicalTrials.gov Sources

**Branch**: `002-openaire-trials` · **Date**: 2026-11-17 · **Spec**: [spec.md](spec.md)

**Input**: Accepted feature specification from `/specs/002-openaire-trials/spec.md`

## Summary

Add OpenAIRE Graph v4 as an opt-in scholarly adapter that uses the current CiteKit scholarly record, dedupe, and deterministic rank path. Add ClinicalTrials.gov API v2 as an opt-in, separately typed trial collection, rendered outside scholarly ranking and carried separately through CLI/MCP outputs. Implement each adapter once in `index.html` and reuse it through `tools/load-ll.mjs`. Browser-origin fetches to both APIs succeeded from the local CiteKit page in Chromium on 2026-11-17. Preserve mixed OpenAIRE instance review states instead of reducing them to a false binary.

## Technical Context

**Language/Version**: Browser JavaScript (modern fetch/AbortController); Node.js 18+ for tools/tests.

**Primary Dependencies**: No new runtime dependencies. OpenAIRE Graph API v4 and ClinicalTrials.gov API v2 over HTTPS GET.

**Storage**: No schema migration. Existing localStorage library records; OpenAIRE provenance fields and TrialRecord `kind` survive record ingestion/export.

**Testing**: Existing scripts (`tests/verify.mjs`, `tests/browser.mjs`, `tests/mcp-server.mjs`, `tests/tools-search.mjs`, `tests/proxy-integration.mjs`) plus focused assertions and live upstream checks. Test actual browser-origin fetches in Chromium.

**Target Platform**: Static browser app; Node CLI and MCP stdio server through `tools/load-ll.mjs`.

**Project Type**: Single-file web application with headless CLI/MCP harnesses.

**Performance Goals**: New sources are off by default. When enabled, each source adds at most one bounded request per query and must not block other sources on failure. Record elapsed times in the live integration test; no unmeasured latency promise.

**Constraints**: No build/dependency, no secret, no proxy-boundary change without review, same shipping adapter for all surfaces, stable public contracts, peer-review status may be mixed/unknown, registered trials are not papers.

**Scale/Scope**: Two opt-in sources; OpenAIRE publication records join existing papers, ClinicalTrials.gov results remain a separate bounded lane. No backfill or persistent migration.

## Constitution Check

- No secrets: **PASS** — both integrations are public GET endpoints and require no key.
- BYOK: **PASS** — no user model key path changes.
- Proxy boundary: **PASS** — browser tests succeeded; no proxy target or allowlist change is planned. If repeated browser verification contradicts the observed result, stop and obtain a separate proxy design review rather than adding an ad hoc relay.
- Deterministic explainable ranking: **PASS** — OpenAIRE supplies ordinary scholarly records; no consensus signal added. Trials bypass paper ranking entirely.
- Evidence before claim: **PASS with evidence captured in research.md and README** — real Chromium fetches and live schemas; six-query overlap and a limited topical sample are documented with their limitations.
- One shipping implementation: **PASS** — adapter functions live only in `index.html`; tools load the same script.
- Re-runnable unmocked verification: **PASS** — live endpoint and Chromium checks are included in validation plan.
- Static/dependency-minimal: **PASS** — no runtime dependencies.
- Stable public contracts: **PASS** — existing tool names/schema and citation format remain; add source values and optional response field without changing existing parameter defaults.

## Project Structure

### Documentation (this feature)

```text
specs/002-openaire-trials/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openaire.md
│   ├── clinicaltrials.md
│   └── surfaces.md
└── checklists/requirements.md
```

`tasks.md` is generated for implementation and tracked with `progress.md`.

### Source Code (repository root)

```text
index.html                  shared adapters, source checkboxes, search orchestration, results UI
 tools/load-ll.mjs          existing loader; unchanged unless new LL globals need harness visibility
 tools/search.mjs           CLI source registry and separate trial output lane
 tools/mcp-server.mjs       MCP registry and separate trial output field
 tests/verify.mjs           adapter normalization, dedupe, lane separation, and ranking assertions
 tests/browser.mjs          live browser-origin source/API and UI checks
 tests/mcp-server.mjs       source selection and typed output contract
 tests/tools-search.mjs     CLI source registry and typed output contract
```

**Structure Decision**: Retain the existing single `index.html` application architecture. No `src/`, backend, worker, or dependency is added.

## Complexity Tracking

No constitution violations. No complexity exception required.

---

## Carried Forward

### Confirmed Decisions

- User accepted adding both sources.
- OpenAIRE is a scholarly source; ClinicalTrials.gov is an explicitly separate registry lane.
- Both are opt-in; trials do not merge into scholarly records or enter paper ranking.
- One adapter implementation in `index.html` powers browser, CLI, and MCP.
- OpenAIRE review flags are instance-level; conflicting instances are mixed/uncertain.

### Constraints

- No keys, runtime dependencies, backend, or proxy changes.
- Preserve `window.LL`, `ll.*`, MCP tool names and current defaults, and citation numbering.
- Web results remain a distinct, not-peer-reviewed lane.
- UI and tool output must never represent trial registration/status as efficacy evidence.

### Assumptions

- OpenAIRE search can be requested with `search`, `filter=type:publication`, `page`, and `page_size`.
- ClinicalTrials.gov uses `query.term`, `pageSize`, and the v2 `studies` response structure.
- The first version requests one bounded page; pagination beyond the bounded page remains deferred unless acceptance tests show it is required.
- Both endpoints permitted browser-origin GET requests in Chromium and passed the repeatable app-origin browser test.

### Risks

- OpenAIRE returns aggregated duplicates, low-value records, and inconsistent per-instance metadata. Six-query overlap and relevance sampling is documented in README with limits from intermittent baseline provider failures.
- Broad ClinicalTrials.gov queries can be noisy and return many thousands of studies.
- APIs, CORS, licenses, and query syntax may change.
- Existing source list enumerations are duplicated in UI, CLI, MCP, and tests and can drift.

### Open Questions

- Final caps: OpenAIRE defaults to the caller's `per` (10 in tools) with a hard cap of 25; ClinicalTrials.gov defaults to 10 with a hard cap of 20. Both request one bounded page.
- OpenAIRE uses a DOI URL when present and a safe instance URL otherwise; unusable records are skipped.
- CLI/MCP expose a separate `trials` collection while keeping the paper `records` contract stable.

## Scope Confirmation

### In Scope

- OpenAIRE publication search, normalized record, attribution, OA/access and peer-review state, scholarly dedupe/rank.
- ClinicalTrials.gov search, TrialRecord normalization, separate UI section and explicit typed CLI/MCP output.
- Opt-in source controls, per-source degradation, live/browser verification, relevance sample, and measured documentation.

### Out of Scope

- Changing ranking weights or using source consensus.
- Adding clinical efficacy/result synthesis, trial ranking, or merging trials with publication records.
- Proxy changes, new credentials, API keys, subscription indexes, or new runtime dependencies.
- Broad redesign of existing source selection or web search.

### Requirements Affected

- FR-001–FR-005: OpenAIRE adapter, response handling, scholarly merge/rank.
- FR-006–FR-011: trial data, separate section, opt-in/degradation.
- FR-012–FR-016: CLI/MCP shared use, attribution, stable contracts, browser proof, opt-in defaults.

## Repository Findings

### Relevant Components

- `index.html`: source checkbox markup near lines 120–132; adapter/shape validation near 320–760; `SOURCES`, `dedupe`, and `runSearch` near 914–1000; scholarly/web renderer near 1027–1082; `window.LL` exports near 1492.
- `tools/load-ll.mjs`: extracts and executes the shipping app script against the shared DOM stub for headless clients.
- `tools/search.mjs`: `KEYLESS` / `OPT_IN`, registry, concurrent retrieval, scholarly/web split, CLI output/Markdown.
- `tools/mcp-server.mjs`: MCP source registry, `search()` merge/rank, record trimming, `search_literature` schema/description.
- `tests/verify.mjs`, `tests/browser.mjs`, `tests/mcp-server.mjs`, `tests/tools-search.mjs`: existing integration and contract tests.
- `.specify/memory/constitution.md`: architecture, security, evidence, verification, and public-interface constraints.

### Existing Behavior

- The original nine scholarly sources are enumerated in UI and MCP; this feature adds OpenAIRE as the tenth. CLI has source registry plus defaults/opt-ins. Scholarly records dedupe by DOI then normalized title and run through `rankResults`.
- `rankScore` uses lexical match, citations, readable full text, and OA. Consensus is displayed only; it is explicitly not scored.
- Web search is separate from paper ranking and has `kind: "web"`; web is enabled by default.
- `runSearch` handles scholarly sources with `Promise.allSettled`; each rejected source is reported while others complete.
- Library items are persisted with `kind` and existing saved data needs no migration.
- MCP output currently returns only scholarly `records` for `search_literature`; CLI currently splits `kind === 'web'` from papers.

### Existing Tests

- `tests/verify.mjs` tests live source output, shape, ranking/dedupe, and DOM-stub behavior.
- `tests/browser.mjs` uses Chromium; with this feature the UI has ten scholarly controls, one registry control, and the web control.
- `tests/mcp-server.mjs` exercises a real server over stdio and asserts tool list/schema and returned data.
- `tests/tools-search.mjs` verifies CLI options, live web and literature, serialization/cache behavior.
- No property-test framework detected; use focused example-based and invariant assertions, no new dependency.

### Project Conventions

- Add shape validators in `SHAPES`, adapters returning consistent paper record fields, per-source opt-in defaults, non-blocking `Promise.allSettled`, sanitize external strings via existing helpers/rendering, expose adapter through `window.LL`, exercise live upstream without HTTP-layer mocks.
- CLI/MCP share the shipping script via `loadLL`; do not copy adapter logic.
- Use source-level failures in the existing `errors` list; do not fail the full search on one adapter.

### Constraints Discovered

- The current UI is designed around `RESULTS` and `WEB_RESULTS`; a third lane must have independent state and rendering to satisfy trial separation.
- Citation expansion and metadata enrichment accept scholarly records only. Trial records must not enter either operation.
- OpenAIRE aggregated `instances[]` can hold conflicting `refereed` values; a single top-level peer-reviewed boolean is unsafe unless its aggregation rule is explicit.
- MCP and CLI currently expose enumerated source names in multiple places. Update registry, defaults/opt-ins/descriptions, tests, and output formatting together.

## Architecture Overview

The app adds two independent opt-in adapters to `index.html`. OpenAIRE maps publication records into the current scholarly record shape and then uses the existing dedupe/rank pipeline. ClinicalTrials.gov maps each study into a `TrialRecord` collection that is excluded from dedupe/rank/enrichment/citation expansion and rendered in its own “Registered studies (ClinicalTrials.gov)” section. `runSearch` settles both lanes independently. CLI and MCP call the same adapter methods, split `kind: "trial"` records out before ranking, and return those under a separate trial field. All source controls default off.

## Major Components

- `searchOpenAIRE(q, options)`: GET Graph v4 publication search, validate `header` and `results`, map PIDs/instance metadata, clean abstract markup, preserve attribution and review-state detail.
- `searchClinicalTrials(q, options)`: GET API v2 `studies`, validate study containers and required identifier/status/title fields, map canonical NCT URL and trial metadata.
- UI state/rendering: add `TRIAL_RESULTS`; checkbox controls; third-lane rendering with status, type, phase, registry link, and neutral registration disclaimer.
- shared search: settle all checked sources, split trials before paper dedupe/rank/enrichment/expansion, report source errors without suppressing other lanes.
- CLI: add `openaire`, `clinicaltrials` names; preserve paper records and web behavior; separately return/render trials.
- MCP: add source selection while preserving `search_literature`; structured `trials` property and distinct `kind: "trial"` records; no new tool unless required by implementation review.
- tests/docs: live API + Chromium test, edge cases for mixed flags and non-merging, relevance/coverage evidence and attributed documentation.

## Data Flow

1. User selects sources (both new options unchecked initially), enters a query.
2. UI dispatches each checked source once. Adapters make HTTPS GET requests and validate status/JSON/shape.
3. OpenAIRE adapter emits scholarly records; ClinicalTrials adapter emits `kind: "trial"` records.
4. `Promise.allSettled` collects each source outcome. Trial records move to `TRIAL_RESULTS`; only scholarly outputs are deduped, OpenAlex-enriched, ranked, and optionally citation-expanded. Web remains independent.
5. Renderer presents papers, then trials, then web with separate headings. Ingesting a trial persists `kind: "trial"`; it remains identifiable in library/context and is not represented as a paper.
6. CLI/MCP use the identical LL adapters. They return paper `records` and a separate `trials` array; CLI Markdown uses a registry-specific heading and status label.

## Interfaces and Contracts

- `LL.searchOpenAIRE(query, {per, oaOnly, yearFrom}) -> ScholarlyRecord[]`.
- `LL.searchClinicalTrials(query, {per}) -> TrialRecord[]`.
- Paper record gains optional `peerReviewStatus: "peer-reviewed" | "not-peer-reviewed" | "mixed" | "unknown"`, optional OpenAIRE PID/attribution and `source` / `_also` provenance. Legacy `peerReviewed` is true only when supported consistently across relevant instances; ambiguous records render as “review status mixed/unknown”, not “peer reviewed”.
- Trial record: `{id: "clinicaltrials:NCT…", kind: "trial", nctId, title, abstract, status, studyType, phases, url, source: "ClinicalTrials.gov"}`. No `doi`, citation count, or paper-rank value is required.
- MCP `search_literature` keeps current inputs and paper `records`; add `trials` (empty when not selected), preserving existing tool name and accepted arguments. Return paper-only `total`; document `trialTotal` if a count is useful.
- CLI JSON keeps `records` shape for papers/web and adds `trials` per query; markdown labels trials as registry records and does not emit scholarly ranking fields for them.
- Request contracts and rate caps are specified in `contracts/`.

## Dependencies

No new package. External services: OpenAIRE Graph API v4 and ClinicalTrials.gov API v2. Primary docs are linked in `research.md` and endpoint request contracts.

## Error Handling

- Non-2xx, JSON parse, shape failures, malformed individual records, and fetch errors become a source-specific error. Skip malformed records; reject the adapter for unusable top-level response shape.
- Keep valid empty arrays distinct from source failures.
- Each source is independent under `Promise.allSettled`; one failure does not discard another source, the other lanes, or existing search results.
- No silently fabricated title, DOI, peer-review state, status, or URL. Ignore records lacking required title/registry identifier as appropriate.
- Trial status is shown exactly as the API value mapped to a readable label; unknown values are preserved as “Unknown (raw value)” rather than normalized into a completed/recruiting claim.

## Security and Privacy

Public query GETs only; no credentials or user model key sent. Encode query parameters with `URLSearchParams`. Render untrusted source content through safe text helpers (`el`/textContent or escaped HTML), never as trusted markup. Keep current proxy allowlist unchanged. Trial/paper/web records remain data, never prompt instructions. Honor OpenAIRE attribution.

## Performance and Reliability

Both new sources are unchecked by default, avoiding new default requests. Request only one bounded page: OpenAIRE `page_size` capped at 25, ClinicalTrials.gov `pageSize` capped at 20. Use the existing `jget` timeout; do not retry automatically. Use nonblocking settled results. Keep trial count bounded and pagination deferred pending user evidence.

## Validation Strategy

- Unit-like headless checks through the shipping script for normalization of present/missing/mixed fields, shape failure, empty result, DOI/title dedupe, and deterministic ranking input.
- Live Node source checks verify current response schemas and record IDs, but do not establish browser callability.
- Real Chromium `tests/browser.mjs` checks each endpoint from the served app origin, each new checkbox defaults off, toggling on invokes it, rendered lanes/labels/links are distinct, and failure is isolated.
- Run `node tests/verify.mjs`, `node tests/browser.mjs`, `node tests/mcp-server.mjs`, `node tests/tools-search.mjs`, and `node tests/proxy-integration.mjs`; run `./scripts/verify` if configured and available.
- On the fixed six-query benchmark, compare OpenAIRE against all available baseline sources using DOI and normalized title, relevance-grade at least 30 candidate-new records (title+abstract; report unknown where abstract absent), and report query/overlap/failure counts. Trials are evaluated separately with five intervention-applicable queries; inspect status/types and report relevance/noisy hit rate.
- Update README only after actual measurements are run; include query date, CORS results, attribution statement, limitations, and no unsupported claim of marginal utility.

## Correctness Properties

| Property ID | Requirement | Scope | `for any …` statement | Check method | Non-mapped reason |
| --- | --- | --- | --- | --- | --- |
| P-001 | FR-001 | operation | for any valid OpenAIRE response, the adapter returns only normalized records with a nonempty title and source OpenAIRE | example-based invariant assertions | No property framework detected; example-based tests chosen |
| P-002 | FR-002 | type | for any record's instance review flags, peerReviewStatus is peer-reviewed only when evidence supports it, non-peer-reviewed only when all provided values say so, mixed when both occur, otherwise unknown | example-based invariant assertions | No property framework detected |
| P-003 | FR-003 | system | for any scholarly duplicate set sharing DOI or normalized title, scholarly dedupe emits one record and preserves every contributing source | example-based invariant assertions | No property framework detected |
| P-004 | FR-004 | operation | for any paper results list, ranking is determined only by existing lexical/citation/readability/OA inputs and not by source count | existing rank tests + deterministic comparison | No property framework detected |
| — | FR-005 | — | — | — | External failure cases tested with invalid fixtures and live transport; property not useful |
| P-005 | FR-006 | operation/type | for any valid study with NCT identifier and title, adapter emits kind trial with status and canonical URL, preserving study type/phase where present | example-based invariant assertions | No property framework detected |
| P-006 | FR-007 | system | for any trial/paper records with matching title or DOI, trial remains in the independent trial collection and paper dedupe/ranking inputs contain no trial | runtime assertions in harness | — |
| — | FR-008–FR-009 | — | — | — | Rendering/wording are example-based browser checks; efficacy implication requires review |
| P-007 | FR-010–FR-011, FR-016 | operation | for any per-source failure or unchecked source, other chosen sources complete and unchecked source receives zero calls | browser/headless assertions | No property framework detected |
| — | FR-012–FR-015 | — | — | — | Cross-surface contract, attribution, and browser callability verified by dedicated integration/review checks |

### Rules

The properties above are limited to executable normalization and lane-separation invariants. External availability, human relevance, legal attribution, UI wording, and browser capability are verified by live integration or review, not claimed as universal laws.

### Framework decision

- **Detected**: none found.
- **Version / where found**: no `fast-check` dependency or `fc.property` usage; repository has no package manifest for runtime/tests.
- **Signal**: standard-library Node test scripts and the repository's unmocked live-HTTP convention.
- **Decision**: fallback to example-based assertions and explicit invariant loops; do not add a dependency.

### Traceability

`FR-001 → P-001 → verify adapter assertions`; `FR-002 → P-002 → mixed/missing metadata assertions`; `FR-003 → P-003 → dedupe assertions`; `FR-004 → P-004 → rank assertions`; `FR-006 → P-005 → trial mapping assertions`; `FR-007 → P-006 → lane separation assertions`; `FR-010/011/016 → P-007 → failure/unchecked-source assertions`. Remaining FRs map to contract/UI/live/browser validation described above and task mapping is completed in `tasks.md`.

### Independence

This planning stage preserves the template's correctness-property constraints; no property framework is introduced.

## Alternatives Considered

| Option | Advantages | Disadvantages | Decision |
| --- | --- | --- | --- |
| OpenAIRE as separate scholarly lane | Isolates noisy aggregator records | Adds a lane and duplicate paper UI; semantically papers are still scholarly works | Rejected; map into paper lane with provenance and peer-review uncertainty |
| ClinicalTrials.gov as paper records | Minimal UI/tool plumbing | Misrepresents registry records and contaminates rank/citation workflow | Rejected; separate typed lane per accepted spec |
| Separate MCP trial tool | Explicit schema purpose | Expands public MCP tool surface and duplicates search semantics | Rejected for MVP; `search_literature` supports selection and returns `trials` separately |
| Proxy all source calls | Could mask CORS differences | Adds infrastructure/security scope; browser-origin calls already succeeded | Rejected; direct fetch unless repeat tests show otherwise |
| Default both sources on | Immediate discovery | Alters latency and results by default | Rejected; opt-in preserves existing behavior |

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| OpenAIRE results are noisy or duplicate heavily | Medium | Medium | DOI/title dedupe, separate provenance, 30+ relevance sample; make no marginal-value claim until measured |
| Mixed instance peer-review flags are misrepresented | High | High | explicit four-state field; do not infer majority or top-level true; test mixed cases |
| Trial registry results confused with published evidence | Medium | High | dedicated heading/type/status/link and neutral registration disclaimer in UI, CLI and MCP |
| Broad trial query returns irrelevant records | High | Medium | bounded result count, visibly registry-origin records, evaluate queries separately; no relevance promises |
| Upstream schema/CORS changes | Medium | High | response shape checks and live Chromium regression test; clear per-source degradation |
| Cross-surface source list drifts | Medium | Medium | update enumerations and assertions in index, CLI, MCP, browser, docs together |
| OpenAIRE license attribution omitted | Low | High | persistent OpenAIRE attribution near source results and documentation; review current official terms |

## Requirement-to-Design Traceability

| Requirement | Design Decision | Reason |
| --- | --- | --- |
| FR-001 | Shared `searchOpenAIRE` adapter validates publication response and normalizes papers | Same shipping implementation, existing shape |
| FR-002 | Store IDs/PIDs, fields, access, `peerReviewStatus`, and attribution; sanitize description markup | Preserve only supported metadata and acknowledge source |
| FR-003 | Use current `dedupe` on paper-only list and preserve `_also` provenance | Existing stable behavior |
| FR-004 | Existing `rankResults`; no new consensus feature | Constitution and measured rejected consensus signal |
| FR-005 | Shape/status errors reject source promise and remain in per-source errors | Existing resilient fan-out |
| FR-006 | `searchClinicalTrials` produces a typed TrialRecord | Registry identity/status must remain explicit |
| FR-007 | Split `kind === 'trial'` before paper dedupe/rank/expand | Prevent semantic contamination |
| FR-008–009 | Independent `TRIAL_RESULTS` section and efficacy disclaimer | User-visible distinction and evidence integrity |
| FR-010–011, FR-016 | `Promise.allSettled`, checkboxes default off | Degradation and opt-in guarantees |
| FR-012 | LL adapter functions exposed to CLI/MCP; `trials` response field | One implementation, client usability |
| FR-013 | OpenAIRE attribution text and per-record source | CC BY / source attribution requirement |
| FR-014 | Existing contracts and storage names retained; new fields additive | Backwards compatibility |
| FR-015 | Real Chromium fetch assertions for both URLs | Node success does not establish browser access |
| FR-016 | Both new checkboxes default unchecked; test zero adapter calls until enabled | Preserve existing default search behavior |

## Implementation Boundaries

### Must Change

- `index.html`, `tools/search.mjs`, `tools/mcp-server.mjs`, `tests/verify.mjs`, `tests/browser.mjs`, `tests/mcp-server.mjs`, `tests/tools-search.mjs`, `README.md` after verified metrics; feature contract/design docs.

### Must Not Change

- `proxy/worker.js` or proxy allowlists unless separately re-scoped and reviewed.
- `ll.*` keys, `window.LL`, current MCP tool names/required inputs, citation numbering, OpenAlex ranking weights, and Tavily's separate lane.
- Existing defaults for sources and web; neither new adapter is called unless selected.
- Treat trial records as papers or assume efficacy based on registration/status.

## What Changed / What Remains Open

- **Changed from the spec:** Status updated from Draft to Accepted on 2026-11-17 following the user's explicit approval; live evidence is recorded that browser fetches succeeded and OpenAIRE per-instance flags can conflict.
- **Resolved during implementation:** Request caps, OpenAIRE DOI/instance URL fallback, separate CLI/MCP `trials`, attribution in cards and exports, and live browser callability are implemented and verified.
- **Still open:** The measured relevance sample is small and baseline-limited; the pre-existing DOAJ live assertion is stale; and a keyless full headless run is still sensitive to upstream quotas.
- **Needs approval:** No new approval for the implemented scope; a proxy change, changed public MCP signature, or material scope change returns for separate review.
