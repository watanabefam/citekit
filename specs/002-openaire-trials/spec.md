# Feature Specification: OpenAIRE and ClinicalTrials.gov Sources

**Feature Branch**: `002-openaire-trials`

**Created**: 2026-11-17

**Status**: Accepted

**Input**: User description: "Proceed with both" — add OpenAIRE as a scholarly search source and ClinicalTrials.gov as a separate trial registry lane, following the live source benchmark.

## Document Status

**Status changed:** 2026-11-17 (accepted)
**Approved by:** User · **Authority:** Explicit instruction to proceed with both and acceptance of the recommendation to review and accept this spec
**Workflow:** Full spec-driven · **Companion:** [plan.md](plan.md), informative design companion

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search OpenAIRE scholarly works (Priority: P1)

A CiteKit researcher enables OpenAIRE and searches a topic. OpenAIRE results appear as scholarly records in the existing paper results flow, with DOI or stable landing URL, title, publication year, abstract where provided, source attribution, and peer-review status when the record supports it.

**Why this priority**: The benchmark found candidate unique records in all six tested topical areas and a working documented Graph v4 query interface. This is the requested addition to scholarly search.

**Independent Test**: From a real browser-origin app page, run a known OpenAIRE query; verify validated JSON results, normalized record fields, dedupe against the existing sources, and an actionable source error when the upstream response is invalid or unavailable.

**Acceptance Scenarios**:

1. **Given** OpenAIRE is enabled, **When** the researcher searches a topic, **Then** OpenAIRE records are normalized and participate in the scholarly ranking and dedupe.
2. **Given** an OpenAIRE result matches a record from another source by DOI or normalized title, **When** results are merged, **Then** one scholarly record remains and its provenance includes OpenAIRE.
3. **Given** OpenAIRE instances for one work report consistent, conflicting, or absent peer-review flags, **When** the work is displayed, **Then** the status is shown as peer-reviewed, not peer-reviewed, mixed, or unknown as supported by those flags, and conflicting or absent data is never presented as confirmed peer-reviewed.

### User Story 2 - Find registered studies separately from papers (Priority: P1)

A researcher enables ClinicalTrials.gov and searches for trials related to performance, health, or wellbeing. Registry records appear in a visually separate section and show registry identifier, study status, study type, phase where available, and a link to the registry record. They are not ranked or described as scholarly papers.

**Why this priority**: Trial registrations contribute protocol and status information absent from ordinary paper search. Keeping this separate prevents them being mistaken for published evidence.

**Independent Test**: From the browser app, search a known topic with trials enabled; verify the separate section, identifiers/status/link, non-merging with papers, and graceful degradation when the API fails.

**Acceptance Scenarios**:

1. **Given** ClinicalTrials.gov is enabled, **When** a researcher searches for an intervention-related topic, **Then** matching registry records appear in a separate trials section.
2. **Given** a trial is recruiting, completed, withdrawn, or has unknown status, **When** it is shown, **Then** its exact reported status is visible and not converted into a claim of efficacy.
3. **Given** a trial record has a title matching a paper, **When** the combined results are shown, **Then** it remains a trial record and is not deduplicated into the paper record.

### User Story 3 - Use both sources in CiteKit tools (Priority: P2)

A user or agent can opt in to OpenAIRE and ClinicalTrials.gov through CiteKit’s existing command-line or MCP literature-search surfaces, receive consistent normalized results and explicit trial labeling, and continue to use existing source contracts.

**Why this priority**: Maintaining one retrieval behavior across the app and agent interfaces prevents drift and makes the sources practically useful outside the browser UI.

**Independent Test**: Call each supported headless surface with both new sources selected; verify result types, identifiers, links, status, and errors match the shipping app adapter behavior.

**Acceptance Scenarios**:

1. **Given** a caller selects OpenAIRE, **When** it invokes literature search, **Then** OpenAIRE returns normalized scholarly records through the shared adapter.
2. **Given** a caller selects ClinicalTrials.gov, **When** it invokes literature search, **Then** trial records remain explicitly typed and separated from scholarly ranking/output.
3. **Given** either source is unavailable, **When** a search runs, **Then** CiteKit reports that source as degraded and continues returning other available results.

### Edge Cases

- OpenAIRE returns a valid empty result set versus an invalid response shape or a non-success HTTP status.
- OpenAIRE metadata omits DOI, abstract, year, title language, peer-review status, or a usable landing URL.
- OpenAIRE returns multiple instances with mixed review/access metadata; the record-level status is unknown or conflicting.
- OpenAIRE results duplicate records already returned by OpenAlex, Crossref, Europe PMC, PubMed, ERIC, DOAJ, CORE, Semantic Scholar, or arXiv.
- ClinicalTrials.gov returns a study with no brief summary, no phase, an observational study type, withdrawn status, or unknown status.
- Broad trial search terms return records that are lexically related but not useful to the user's intended performance topic.
- A trial record title matches a paper or another trial; trials must not merge into paper records.
- Either upstream changes response fields, pagination, query behavior, rate limits, CORS, or licensing terms.
- One new source fails while the other new source and existing sources remain available.
- The user disables either source; no request for that source is made.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN OpenAIRE is enabled and a search is submitted, THE system SHALL query OpenAIRE for research-product publication records and normalize returned items into the CiteKit scholarly-record shape.
- **FR-002**: THE system SHALL preserve OpenAIRE identifiers, DOI when available, title, year when available, author names when available, venue when available, abstract when available, landing URL, access information when available, peer-review indication when supplied, and OpenAIRE provenance without inventing missing fields.
- **FR-003**: WHEN merging OpenAIRE results with other scholarly sources, THE system SHALL deduplicate by DOI and then normalized title using the existing scholarly dedupe behavior, and SHALL preserve source provenance.
- **FR-004**: THE system SHALL include OpenAIRE in its deterministic scholarly ranking only after confirming any ranking inputs are supported by the existing ranking model; it SHALL NOT treat cross-source consensus as a relevance signal.
- **FR-005**: IF the OpenAIRE endpoint fails, returns invalid JSON or an unexpected response shape, THEN THE system SHALL report OpenAIRE as degraded and continue with the remaining sources.
- **FR-006**: WHEN ClinicalTrials.gov is enabled and a search is submitted, THE system SHALL query the public study registry and normalize study identifier, title, summary when available, status, study type, phase when available, and canonical registry URL.
- **FR-007**: THE system SHALL represent ClinicalTrials.gov records as registry/trial records, separate from scholarly papers and web pages, and SHALL NOT merge them into scholarly records by title or DOI.
- **FR-008**: THE system SHALL display ClinicalTrials.gov results in a distinct section labeled as registered studies, with the reported status visible and a direct registry link.
- **FR-009**: THE system SHALL not imply that a registered study demonstrates intervention efficacy solely because it is registered, recruiting, active, or completed.
- **FR-010**: IF the ClinicalTrials.gov endpoint fails or returns invalid data, THEN THE system SHALL report that source as degraded and continue with other available sources.
- **FR-011**: WHILE either source is disabled, THE system SHALL make no request to that source and SHALL preserve existing behavior for the other sources.
- **FR-012**: THE system SHALL expose both sources through the current app search and through the existing CLI/MCP literature-search interfaces, using the shipping `index.html` adapter implementation rather than a second implementation.
- **FR-013**: THE system SHALL attribute OpenAIRE data in accordance with the applicable CC BY requirements and shall keep license/source metadata where needed to render attribution.
- **FR-014**: THE system SHALL retain existing `window.LL`, `ll.*` storage keys, MCP tool names/schemas, citation-number format, scholarly ranking semantics, and the separate web-source behavior.
- **FR-015**: THE system SHALL verify browser-origin callability for each browser-direct source in real Chromium; server-side reachability alone SHALL NOT be treated as browser-callability evidence.
- **FR-016**: THE system SHALL leave OpenAIRE and ClinicalTrials.gov disabled by default so existing searches do not issue new requests unless a user opts in.

### Key Entities *(include if feature involves data)*

- **ScholarlyRecord**: Existing CiteKit paper record augmented with OpenAIRE provenance and any source-supported peer-review/access details.
- **TrialRecord**: Registry record with NCT identifier, title, brief summary, status, study type, phase, URL, source name, and retrieval provenance; it remains distinct from ScholarlyRecord.
- **SearchRun**: Existing multi-source query outcome, extended with per-source errors and a separate trial-results collection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of six representative queries spanning sleep, exercise, habits, resilience, virtue ethics, and spirituality, OpenAIRE returns a structurally valid response in a real-browser test or the UI reports a source-specific degraded state.
- **SC-002**: On a fixed benchmark query set, every OpenAIRE record matching an existing record by DOI or normalized title is represented once in the scholarly results and retains provenance from both sources.
- **SC-003**: Across at least 30 sampled novel OpenAIRE results, a reviewer can classify title/abstract topical relevance and peer-review status without treating unknown status as confirmed peer review; measured yield is reported, not assumed.
- **SC-004**: For the five trial-applicable benchmark topics, each ClinicalTrials.gov query returns records or an honest empty/degraded state, and every displayed record carries a registry identifier, status, and link.
- **SC-005**: No ClinicalTrials.gov record appears in scholarly-paper ranking or is described as a publication in browser, CLI, MCP, or answer-source output.
- **SC-006**: Both new sources are disabled by default; disabling either new source results in zero requests to that source and leaves the remaining scholarly and web paths operational.
- **SC-007**: Existing headless, MCP, CLI, proxy, and Chromium tests continue to pass, with new live upstream and browser-origin checks for both integrations.

## Assumptions

- OpenAIRE is a scholarly discovery source and belongs in the existing scholarly lane, subject to evidence about its search relevance and record quality.
- ClinicalTrials.gov is a trial registry, not a literature database, and must remain in a distinct results lane.
- Both sources are opt-in by default so existing searches do not gain extra latency or change ranking until the user chooses them.
- Trial records may include completed studies without results; status alone is not evidence of an outcome.
- OpenAIRE CC BY attribution can be shown in result/source metadata and documentation without changing the key-custody model.
- The existing proxy contract is not expanded unless real Chromium testing shows a source requires proxy access; any proxy change requires allowlist/origin/security design review.
- Query-level exact novelty from the earlier benchmark is preliminary; topical relevance and metadata quality must be judged before claiming marginal benefit.

---

## Normative Status

Normative sections: User Scenarios & Testing, Edge Cases, Requirements, Key Entities, and Success Criteria. Informative sections: Document Status, Assumptions, Carried Forward, Problem / Opportunity, Goals, Non-Goals, Dependencies and External Contracts, MVP Scope, Future Work, and Validation Plan. This specification is authoritative for intended behavior; its plan and research companion documents are informative and dated.

### Which document wins

This spec is authoritative for behavior. `plan.md`, `research.md`, and `data-model.md` record implementation design and evidence; where they disagree with this spec, this spec prevails unless formally superseded.

## Requirements Syntax (EARS)

Functional requirements use EARS patterns. `SHALL` is the binding normative keyword. Preconditions precede triggers, which precede required responses. Informative sections do not create additional requirements.

## Carried Forward

### Confirmed Decisions

- Add OpenAIRE as a candidate scholarly search source, subject to browser verification and relevance measurement.
- Add ClinicalTrials.gov as a separate, clearly labeled registry lane, never merged or ranked as scholarly papers.
- Both sources are opt-in to preserve existing query cost, latency, and ranking by default.
- Use CiteKit's shipping script and shared adapter pipeline across browser, CLI, and MCP.

### Constraints

- The app remains a single-file, no-backend BYOK workspace with no runtime dependency additions.
- Browser-callability must be established in real Chromium.
- No secrets are introduced or stored for these public sources.
- Existing ranking and web-source boundaries remain intact.
- CiteKit's proxy allowlist and security rules remain unchanged unless a separately reviewed requirement changes them.

### Assumptions

- OpenAIRE Graph v4 is the maintained search route appropriate for new queries.
- ClinicalTrials.gov API v2 supports browser-origin GET requests and structured study search.
- OpenAIRE attribution can be carried through normalized records and displayed.

### Risks

- Search relevance can be noisy; raw unique counts can overstate value.
- OpenAIRE includes records with different review states and source/instance quality; a single work can have conflicting peer-review flags across its instances, so the normalized status must preserve mixed/unknown rather than assert a simple yes/no.
- Trial search may surface irrelevant studies for broad performance topics.
- Upstream CORS, schema, API version, usage limits, or license terms may change.

### Open Questions

- Browser-origin fetches to OpenAIRE Graph v4 and ClinicalTrials.gov API v2 returned HTTP 200 JSON from `http://localhost:8777/` in Chromium on 2026-11-17; test-suite coverage must make this re-runnable.
- OpenAIRE peer-review is reported on individual instances; mixed flags exist within a single aggregated research product and must be surfaced as mixed/uncertain, not a binary label.
- Trial relevance controls should be tested against broad terms; default query scope and max result count are design decisions for the plan.

## Problem / Opportunity

CiteKit's existing sources cover broad scholarly records but the source benchmark suggests possible marginal finds in repository-aggregated research, while the user's performance-optimization fields also benefit from finding registered interventions. OpenAIRE can complement papers; ClinicalTrials.gov can reveal study protocols and status. Without explicit separation, users may mistake trial registration for published evidence or overvalue a broad-index hit count.

## Goals

- Expand scholarly-paper discovery where OpenAIRE contributes useful records not found by the current source set.
- Surface relevant registered trials, including status, in a distinct lane.
- Preserve citation grounding, provenance, source attribution, deterministic ranking, and current public contracts.
- Measure candidate value and browser behavior rather than infer it from API availability.

## Non-Goals

- Replacing OpenAlex or any current source.
- Merging trial records into papers or claiming registered trials establish efficacy.
- Adding subscription databases, scraping protected indexes, or adding another backend.
- Changing proxy targets or credentials without separate review.
- Guaranteeing that every OpenAIRE record is peer-reviewed or relevant.
- Implementing a trial-results evidence grading system.

## Dependencies and External Contracts

- **OpenAIRE Graph API v4**: documented search endpoint `https://api.openaire.eu/graph/v4/research-products`; search over research products with publication type filtering. The current OpenAIRE Graph license documentation describes the Graph as reusable under CC BY (with some CC0 components); retain and display attribution, and verify the applicable license and acknowledgement requirements during implementation.
- **ClinicalTrials.gov API v2**: public study-search endpoint `https://clinicaltrials.gov/api/v2/studies`; returns structured registry records. Preserve the NCT identifier and link to the canonical study page. The API is external and may revise fields/query behavior.
- **Browser CORS**: both endpoints must be verified from real Chromium using the actual app origin before direct browser fetching is accepted.
- **Existing CiteKit contract**: `index.html` is the shipping adapter source; `tools/load-ll.mjs` shares it with CLI/MCP; web results remain separate; scholarly ranking/dedupe stays deterministic.

## MVP Scope

1. Add OpenAIRE as an opt-in scholarly source with robust response-shape validation, normalization, attribution, dedupe, and the existing ranking.
2. Add ClinicalTrials.gov as an opt-in separate trial-results lane, with status/type/phase/identifier/link labels and no merging into papers.
3. Carry both source behaviors through the app and existing CLI/MCP surfaces using shared shipping code.
4. Add live API and real-browser tests, benchmark relevance checks, and documentation of the measured results and limitations.

## Future Work (parking lot)

| # | Idea | Noticed during | Why deferred | Revisit when |
|---|---|---|---|---|
| 1 | Specialist IxTheo or PhilPapers adapter | Source evaluation | API access, browser compatibility, and redistribution terms were not established | A supported public endpoint and reuse terms are confirmed |
| 2 | Trial-results outcome extraction and evidence synthesis | Trial-lane design | Registry status is not outcome evidence; a synthesis feature is a separate product behavior | Users request structured results and an evidence model is specified |
| 3 | Relevance ranking for trial records | Trial benchmark | Keep first version transparent and provider-ranked until judged data supports a deterministic rank | A graded trial benchmark exists |

### Parking lot vs Non-Goals

Non-goals are deliberate exclusions for this feature; the parking lot contains ideas noticed but not approved for this scope.

## Validation Plan

- **Automated tests** — Live adapter shape/normalization tests; DOI/title dedupe tests; trial non-merging and status-label tests; CLI/MCP contract tests; full existing verification suite.
- **Manual checks** — Search all six benchmark queries in Chromium; inspect representative new OpenAIRE records and trial matches; ensure trial lane is visually and semantically separate.
- **Data or migration checks** — No persistent schema migration; ensure library records preserve source/type fields and existing saved data remains readable.
- **Security / privacy checks** — No credentials; browser sends only GET queries to these public sources; proxy contract unchanged; source text remains external evidence and not instructions.
- **Performance checks** — Measure added response time for each source and verify opt-in defaults prevent latency changes for unselected sources.
- **Evidence required for approval** — Exact benchmark queries/results, overlap counts, human relevance sample labels, real Chromium status/CORS results, and test command outputs.

## Requirement Traceability

| Requirement | User Story | Acceptance Criteria | Planned Design Area | Task |
|---|---|---|---|---|
| FR-001–FR-005 | US1 | OA normalized, deduped, ranked, degraded safely | OpenAIRE adapter / ranking | |
| FR-006–FR-011 | US2 | Registry results separate, labeled, optional, degraded safely | Trial adapter / UI lane | |
| FR-012–FR-016 | US3 | Shared pipeline, licensing, contracts, browser verification, opt-in defaults | CLI/MCP/tests/docs | |
