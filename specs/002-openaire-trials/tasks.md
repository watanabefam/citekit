---

description: "Task list for OpenAIRE and ClinicalTrials.gov sources"
---

# Tasks: OpenAIRE and ClinicalTrials.gov Sources

**Input**: Design documents from `/specs/002-openaire-trials/`

**Prerequisites**: `spec.md` accepted; `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` available.

**Tests**: Required by the feature specification and existing repository convention for live upstream and Chromium checks.

**Organization**: Tasks are grouped by user story; test assertions are added alongside each independently verifiable source lane.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story from `spec.md` (US1, US2, US3)
- Descriptions include exact repository paths.

## Path Conventions

This is a single-file static web app with Node tools and tests. Main files are at repository root: `index.html`, `tools/`, `tests/`, and `README.md`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm existing environment; no project initialization or dependency changes are required.

- [x] T001 Confirm branch `002-openaire-trials`, accepted spec/plan artifacts, available test commands, and no new runtime dependencies.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Maintain baseline constraints before source-specific work.

- [x] T002 Add minimal reusable test helpers only if needed to assert request counts and safe lane separation through the existing `tools/load-ll.mjs` harness; do not add dependencies or create a second implementation.

**Checkpoint**: Existing shipping-script harness and verification commands are understood; no code work begins before that baseline check.

## Phase 3: User Story 1 - Search OpenAIRE scholarly works (Priority: P1) 🎯 MVP

**Goal**: Add OpenAIRE as an opt-in scholarly source; normalize and merge records through existing scholarly ranking while preserving attribution and mixed/unknown review status.

**Independent Test**: A real Chromium page search or the live source test returns normalized OpenAIRE records, dedupes against an existing source, displays accurate review/attribution metadata, and degrades without blocking other sources.

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

Tests are explicitly required by this feature spec and the live/browser verification criteria.

### Implementation for User Story 1

- [x] T003 [US1] Add focused OpenAIRE shape, normalization, missing-field, review-state aggregation, and DOI/title dedupe assertions in `tests/verify.mjs`.
- [x] T004 [US1] Implement `searchOpenAIRE`, response validation, publication filtering, identifiers, access fields, attribution, and conservative instance-level `peerReviewStatus` in `index.html`; export the adapter on `window.LL`.
- [x] T005 [US1] Add the unchecked OpenAIRE source control, integrate it into scholarly source selection, render supported review/unknown status and OpenAIRE attribution, and ensure it uses existing scholarly dedupe/rank in `index.html`.
- [x] T006 [US1] Add a Chromium-origin OpenAIRE integration and default-off/no-request check in `tests/browser.mjs`.

**Checkpoint**: OpenAIRE runs independently and does not alter other sources’ behavior or ranking signals.

## Phase 4: User Story 2 - Find registered studies separately from papers (Priority: P1)

**Goal**: Add an opt-in ClinicalTrials.gov source whose typed records remain independent of scholarly and web records.

**Independent Test**: Search from Chromium, see a separate registered-studies section with NCT identifier, raw status, type/phase when present, canonical link, and no paper ranking/merging.

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

Tests are explicitly required by this feature spec and the live/browser verification criteria.

### Implementation for User Story 2

- [x] T007 [US2] Add TrialRecord mapping, missing-field/status/phase, paper-title collision, opt-in, and failure-isolation assertions in `tests/verify.mjs`.
- [x] T008 [US2] Implement `searchClinicalTrials` for the v2 API, response validation, bounded page, canonical NCT URL, safe summary text, and `kind: "trial"` records in `index.html`; export the adapter on `window.LL`.
- [x] T009 [US2] Add the unchecked ClinicalTrials.gov control, independent `TRIAL_RESULTS` state and separately rendered “Registered studies” section with status/type/phase/link and neutral efficacy disclaimer in `index.html`.
- [x] T010 [US2] Add Chromium checks for direct browser callability, opt-in requests, trial lane labeling, status/link visibility, and non-blocking failure handling in `tests/browser.mjs`.

**Checkpoint**: Trial records never enter paper dedupe, ranking, enrichment, citation expansion, or web results.

## Phase 5: User Story 3 - Use both sources in CiteKit tools (Priority: P2)

**Goal**: Expose both shared adapters in CLI/MCP while keeping paper records, registry records, and web results distinct.

**Independent Test**: CLI and MCP source selection returns normalized OpenAIRE papers and a separate typed ClinicalTrials array; failures are per-source and existing tool/input contracts remain usable.

### Tests for User Story 3 (OPTIONAL - only if tests requested) ⚠️

Tests are explicitly required by this feature spec and the live/browser verification criteria.

### Implementation for User Story 3

- [x] T011 [US3] Add CLI contract assertions for opt-in source names, separate trial JSON/Markdown output, and no trial ranking fields in `tests/tools-search.mjs`.
- [x] T012 [US3] Add `openaire` and `clinicaltrials` to the CLI source registry and route `kind: "trial"` to a separate per-query `trials` output and Markdown section in `tools/search.mjs`.
- [x] T013 [US3] Add MCP assertions for optional source selection, paper `records` stability, typed `trials`, and explicit registered-study description in `tests/mcp-server.mjs`.
- [x] T014 [US3] Add both source names to the MCP registry and return trial items separately from paper records without changing tool names or required inputs in `tools/mcp-server.mjs`.

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Validate all requirements, measure relevance, and document only observed results.

- [x] T015 [P] Update source inventory, OpenAIRE attribution, separate registry semantics, and measured limitations in `README.md` only after running the full query benchmark and relevance sample.
- [x] T016 Run headless, browser, MCP, CLI, proxy, and focused six-query source/relevance verification; fix regressions in `tests/verify.mjs`, `tests/browser.mjs`, `tests/mcp-server.mjs`, `tests/tools-search.mjs`, and affected source files.
- [x] T017 Recheck specification/plan traceability, opt-in defaults, trial non-merging, licensing attribution, and unrelated working-tree changes; record completion evidence in `specs/002-openaire-trials/progress.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Complete; no dependencies or build setup needed.
- **Foundational (Phase 2)**: T002 precedes stories only if a shared assertion helper is required; otherwise record the harness check and proceed without changing helper code.
- **User Stories**: US1 and US2 are both P1 and rely on shared UI/search orchestration in `index.html`; keep edits to that file sequential. US3 depends on both adapters being exported and typed.
- **Polish (Phase 6)**: Depends on US1–US3; measured README changes follow benchmark evidence.

### User Story Dependencies

- **US1 (P1)**: After T002; independent scholarly source path.
- **US2 (P1)**: After T002; separate registry lane; no semantic dependency on US1, but index.html edits must be sequenced.
- **US3 (P2)**: After T004 and T008; shared shipping adapters must exist before CLI/MCP integration.

### Within Each User Story

Tests/assertions precede corresponding implementation where practical. Tasks touching `index.html` are sequential. CLI and MCP source changes use different files and may proceed in parallel after both shared adapters exist. No task changes proxy allowlists or credentials.

### Parallel Opportunities

- T003 test additions and Chromium test design can be prepared independently, but code edits to `tests/verify.mjs` and `tests/browser.mjs` should not overlap.
- After T004 and T008 are complete, T011/T013 test additions and T012/T014 separate tool integrations can be grouped by distinct files, with tests before implementations where feasible.
- T015 documentation work must wait for measured outcomes and cannot run in parallel with benchmark generation.

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "OpenAIRE shape and normalization assertions in tests/verify.mjs"
Task: "OpenAIRE Chromium-origin checks in tests/browser.mjs"

# Launch all models for User Story 1 together:
Task: "No standalone model files: the app is a single-file JavaScript project."
```

## Parallel Example: User Story 3

```text
After the shared adapters are exported and their tests pass:
- CLI path: T011 then T012 (`tests/tools-search.mjs`, `tools/search.mjs`)
- MCP path: T013 then T014 (`tests/mcp-server.mjs`, `tools/mcp-server.mjs`)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T002 and US1 tasks T003–T006.
2. Verify OpenAIRE in Chromium and the live adapter path.
3. Continue US2 because the user's approved scope explicitly includes the trial lane; do not ship or report only the OpenAIRE portion as the completed feature.

### Incremental Delivery

1. Add and verify OpenAIRE in the scholarly lane.
2. Add and verify ClinicalTrials.gov in the separate registry lane.
3. Carry both through CLI/MCP with compatible output contracts.
4. Run full regression and relevance evaluation before updating README claims.

### Parallel Team Strategy

No delegation is requested at this stage. If parallel contributors are used later, keep one owner on `index.html`; CLI and MCP changes can be split after shared adapters stabilize.

## Notes

- `[P]` is reserved for tasks that can safely touch different files with no dependency.
- Every implementation requirement is mapped in Requirement Coverage below.
- The project documents `./scripts/verify`, but that script is absent in this checkout. Each task names the relevant existing test command as a runnable fallback; report the missing aggregate verifier separately and do not invent a replacement.
- Do not commit unrelated pre-existing changes. Any commit must stage only feature-owned changes.

---

## Task Detail Block

## T001: Confirm branch and baseline

- **Objective**: Establish that implementation is on the feature branch and follows the accepted design.
- **Addresses requirement(s)**: FR-014
- **Implements design decision(s)**: Preserve the feature branch and static architecture.
- **Depends on**: None
- **Likely files**: `specs/002-openaire-trials/plan.md`, repository status
- **Scope boundaries**: Do not alter pre-existing unrelated work.
- **Expected output**: Feature branch `002-openaire-trials`; known test entry points.
- **Verification**: `git branch --show-current` and `git status --short`.
- **Completion conditions**: Branch confirmed; unrelated modifications remain intact.
- **Risks / rollback**: Branch switch is reversible; no content changed by this task.

## T002: Confirm shared harness and assertion strategy

- **Objective**: Use the existing shipping-script harness and avoid duplicating adapter logic.
- **Addresses requirement(s)**: FR-012, FR-015
- **Implements design decision(s)**: One implementation in `index.html`, tested through `tools/load-ll.mjs` and Chromium.
- **Depends on**: T001
- **Likely files**: `tools/load-ll.mjs`, `tests/verify.mjs`, `tests/browser.mjs`
- **Scope boundaries**: Add no dependencies and make no helper changes unless necessary to satisfy tests.
- **Expected output**: Confirmed test strategy and test coverage locations.
- **Verification**: `node tests/verify.mjs` (baseline; aggregate `./scripts/verify` is documented but absent).
- **Completion conditions**: Existing headless checks run; helper need is decided with evidence.
- **Risks / rollback**: Test-only; no implementation impact.

## T003: Test OpenAIRE normalization and review aggregation

- **Objective**: Specify adapter behavior for OpenAIRE identifiers, optional metadata, mixed review flags, and dedupe.
- **Addresses requirement(s)**: FR-001, FR-002, FR-003, FR-005
- **Implements design decision(s)**: `data-model.md` peer-review aggregation and scholarly dedupe contract.
- **Depends on**: T002
- **Likely files**: `tests/verify.mjs`
- **Scope boundaries**: No HTTP mock layer; deterministic field/aggregation fixtures may be used around the shipping adapter.
- **Expected output**: Assertions fail before implementation and cover valid empty/invalid shapes, missing optional fields, mixed flags, and duplicate provenance.
- **Verification**: `node tests/verify.mjs`.
- **Completion conditions**: Focused assertions fail for missing adapter behavior and pass after T004.
- **Risks / rollback**: Test-only; revert only the added assertions if contract changes after spec review.

## T004: Implement OpenAIRE shared adapter

- **Objective**: Retrieve, validate, and normalize OpenAIRE publication records with conservative provenance metadata.
- **Addresses requirement(s)**: FR-001, FR-002, FR-005, FR-013
- **Implements design decision(s)**: OpenAIRE contract, source attribution, shared `index.html` implementation.
- **Depends on**: T003
- **Likely files**: `index.html`
- **Scope boundaries**: No new ranking weights, no consensus scoring, no proxy changes, no invented fields.
- **Expected output**: Exported adapter returns standard scholarly records; conflicts in `instances[].refereed` become `mixed`.
- **Verification**: `node tests/verify.mjs` and live OpenAIRE request via adapter; browser verification is T006.
- **Completion conditions**: Shape/normalization assertions pass and all returned records have valid titles/source attribution.
- **Risks / rollback**: Reversible adapter-only change; source errors must not block other adapters.

## T005: Add OpenAIRE UI and scholarly integration

- **Objective**: Make OpenAIRE opt-in and include it in existing scholarly dedupe/ranking with attribution.
- **Addresses requirement(s)**: FR-003, FR-004, FR-011, FR-013, FR-016
- **Implements design decision(s)**: Existing `SOURCES`, checkbox selection, and scholarly card display.
- **Depends on**: T004
- **Likely files**: `index.html`
- **Scope boundaries**: Keep new checkbox unchecked; preserve all prior defaults and ranking inputs.
- **Expected output**: OpenAIRE can be selected; duplicate records retain provenance; mixed/unknown review is not falsely shown as reviewed.
- **Verification**: `node tests/verify.mjs` and `node tests/browser.mjs`.
- **Completion conditions**: Default-off and selected-source behavior verified.
- **Risks / rollback**: Revert UI integration without affecting adapter contract.

## T006: Verify OpenAIRE in Chromium

- **Objective**: Prove browser-origin callability and isolated UI behavior.
- **Addresses requirement(s)**: FR-005, FR-015, FR-016
- **Implements design decision(s)**: Real-browser regression and no-call-until-opt-in.
- **Depends on**: T005
- **Likely files**: `tests/browser.mjs`
- **Scope boundaries**: Do not infer callability from Node fetch; do not modify proxy policy.
- **Expected output**: Real Chromium fetch succeeds or the UI reports a source-specific degraded state; disabled source makes no request.
- **Verification**: `node tests/browser.mjs` with local server running.
- **Completion conditions**: Browser assertions pass; any failure is recorded honestly for the adapter.
- **Risks / rollback**: Browser test changes are reversible; CORS requiring a proxy is outside this task and needs review.

## T007: Test ClinicalTrials record mapping and separation

- **Objective**: Define typed trial fields and prove a title collision cannot merge into a scholarly record.
- **Addresses requirement(s)**: FR-006, FR-007, FR-009, FR-010, FR-011
- **Implements design decision(s)**: `TrialRecord` contract and separate-lane invariant.
- **Depends on**: T002
- **Likely files**: `tests/verify.mjs`
- **Scope boundaries**: No claim about efficacy and no HTTP mock at the transport layer.
- **Expected output**: Assertions cover identifier/title/status/url, optional summary/type/phase, unknown status, empty response, invalid shape, collision, and failure isolation.
- **Verification**: `node tests/verify.mjs`.
- **Completion conditions**: Assertions fail until adapter and separation code are implemented, then pass.
- **Risks / rollback**: Test-only and reversible.

## T008: Implement ClinicalTrials.gov shared adapter

- **Objective**: Fetch and normalize bounded API v2 study records as typed trial entries.
- **Addresses requirement(s)**: FR-006, FR-007, FR-010
- **Implements design decision(s)**: `contracts/clinicaltrials.md` and `TrialRecord` model.
- **Depends on**: T007
- **Likely files**: `index.html`
- **Scope boundaries**: No pagination, credential, result interpretation, efficacy language, or paper fields.
- **Expected output**: `kind: "trial"` records with NCT ID, raw status, canonical URL, and optional summary/type/phase.
- **Verification**: `node tests/verify.mjs` and live ClinicalTrials.gov adapter request.
- **Completion conditions**: Valid records normalize; malformed items are skipped; invalid top-level responses degrade.
- **Risks / rollback**: Reversible adapter; changing API assumptions requires updating contract/research first.

## T009: Add independent registry UI lane

- **Objective**: Render registry entries separately and make opt-in behavior explicit.
- **Addresses requirement(s)**: FR-007, FR-008, FR-009, FR-011, FR-016
- **Implements design decision(s)**: `TRIAL_RESULTS` independent state and neutral “registration is not efficacy evidence” copy.
- **Depends on**: T008
- **Likely files**: `index.html`
- **Scope boundaries**: Trial records never enter scholarly dedupe, rank, enrichment, or citation expansion.
- **Expected output**: A labeled section shows NCT ID, exact status, type/phase when present, direct link, and disclaimer.
- **Verification**: `node tests/verify.mjs` and `node tests/browser.mjs`.
- **Completion conditions**: Lane-separation and visible labels are asserted.
- **Risks / rollback**: UI-only change can be reverted while retaining adapter.

## T010: Verify ClinicalTrials.gov in Chromium

- **Objective**: Prove browser callability, opt-in request behavior, separate rendering, and source-failure isolation.
- **Addresses requirement(s)**: FR-008, FR-010, FR-011, FR-015, FR-016
- **Implements design decision(s)**: Real Chromium checks from app origin.
- **Depends on**: T009
- **Likely files**: `tests/browser.mjs`
- **Scope boundaries**: No proxy allowlist change or Node-only assertion as a substitute.
- **Expected output**: Trial section appears only when selected; endpoint failure does not hide other lanes.
- **Verification**: `node tests/browser.mjs` with local server running.
- **Completion conditions**: Browser checks pass against live endpoint or show an honest degraded state.
- **Risks / rollback**: If direct fetch fails, stop before changing proxy; seek separate approval.

## T011: Test CLI contract for new sources

- **Objective**: Protect existing CLI paper/web output and specify separate trial serialization.
- **Addresses requirement(s)**: FR-012, FR-014
- **Implements design decision(s)**: `contracts/surfaces.md`.
- **Depends on**: T004, T008
- **Likely files**: `tests/tools-search.mjs`
- **Scope boundaries**: Do not change existing flags/default source set or web record handling.
- **Expected output**: Contract assertions distinguish paper records and trials and verify opt-in.
- **Verification**: `node tests/tools-search.mjs`.
- **Completion conditions**: Assertions exercise JSON/Markdown paths and existing web behavior.
- **Risks / rollback**: Test-only; reversible.

## T012: Integrate sources in CLI

- **Objective**: Route both opt-in source names through shared adapters and emit trials separately.
- **Addresses requirement(s)**: FR-007, FR-009, FR-012, FR-014
- **Implements design decision(s)**: Shared implementation in `index.html`; no duplicate fetch logic.
- **Depends on**: T011
- **Likely files**: `tools/search.mjs`
- **Scope boundaries**: Preserve default sources, web separation, ranking, and existing output fields.
- **Expected output**: `--sources openaire,clinicaltrials` selects both, with paper records and trial array/Markdown lane distinct.
- **Verification**: `node tests/tools-search.mjs`.
- **Completion conditions**: Existing CLI contract passes and new source response is explicitly typed.
- **Risks / rollback**: Revert registry/output changes in this file only.

## T013: Test MCP contract for new sources

- **Objective**: Verify existing `search_literature` inputs and paper records remain stable while trials are separate.
- **Addresses requirement(s)**: FR-012, FR-014
- **Implements design decision(s)**: Additive `trials` response property; retain tool name and required query.
- **Depends on**: T004, T008
- **Likely files**: `tests/mcp-server.mjs`
- **Scope boundaries**: Preserve all unrelated pre-existing edits in `tools/mcp-server.mjs`; avoid changing credentials/key-custody behavior.
- **Expected output**: Tests cover source enum/use, result typing, degradation, and unchanged required schema.
- **Verification**: `node tests/mcp-server.mjs`.
- **Completion conditions**: Existing protocol assertions and new contract assertions pass.
- **Risks / rollback**: Test-only and reversible.

## T014: Integrate sources in MCP

- **Objective**: Add opt-in adapter dispatch and a separate trial result field to MCP literature search.
- **Addresses requirement(s)**: FR-007, FR-009, FR-012, FR-014
- **Implements design decision(s)**: Preserve `search_literature`; trials excluded from paper ranking and trimming.
- **Depends on**: T013
- **Likely files**: `tools/mcp-server.mjs`
- **Scope boundaries**: Preserve uncommitted prior key-custody changes, MCP tool names, required inputs, keys, and paper schemas.
- **Expected output**: `records` remain scholarly; `trials` hold `kind: "trial"` with required identifier/status/url.
- **Verification**: `node tests/mcp-server.mjs`.
- **Completion conditions**: MCP live path and all protocol assertions pass.
- **Risks / rollback**: Stage/revert only feature hunks; do not overwrite or commit unrelated pre-existing changes.

## T015: Update measured documentation

- **Objective**: Document the new sources and their limitations without unsupported value claims.
- **Addresses requirement(s)**: FR-013, FR-014; Success Criteria SC-003–SC-005
- **Implements design decision(s)**: Evidence Before Claim; OpenAIRE attribution.
- **Depends on**: T006, T010, T012, T014, T016
- **Likely files**: `README.md`
- **Scope boundaries**: No metric unless computed; no claim of relevance improvement based only on novelty counts.
- **Expected output**: Accurate source inventory, attribution, separate registry description, measured relevance/errors and limitations.
- **Verification**: `node tests/source-value.mjs` plus benchmark command/output recorded in README.
- **Completion conditions**: Documentation values reproduce from the stated probe and all claims have evidence.
- **Risks / rollback**: Revert only new source documentation; no source implementation dependency.

## T016: Run integrated regression and relevance evaluation

- **Objective**: Verify both source integrations against the accepted criteria and current regressions.
- **Addresses requirement(s)**: FR-001–FR-016, SC-001–SC-007
- **Implements design decision(s)**: Full validation strategy in `plan.md`.
- **Depends on**: T006, T010, T012, T014
- **Likely files**: `tests/verify.mjs`, `tests/browser.mjs`, `tests/mcp-server.mjs`, `tests/tools-search.mjs`, `tests/source-value.mjs`, `README.md` if evidence changes.
- **Scope boundaries**: Do not change ranking weights, proxy targets, or existing source defaults; report unavailable checks honestly.
- **Expected output**: Passing test outputs, browser results, source overlap/relevance sample, and trial query review.
- **Verification**: `node tests/verify.mjs`; `node tests/browser.mjs`; `node tests/mcp-server.mjs`; `node tests/tools-search.mjs`; `node tests/proxy-integration.mjs`; `node tests/source-value.mjs`. The documented aggregate `./scripts/verify` is absent in this checkout.
- **Completion conditions**: Each result is recorded; all failures are fixed or explicitly left unresolved with reason; README metrics updated only after probes.
- **Risks / rollback**: Revert only feature-owned fixes; test output/screenshot artifacts stay ignored or are removed if created by this task.

## T017: Converge artifacts and record evidence

- **Objective**: Ensure implementation, spec, plan, tasks, docs, and working-tree ownership align.
- **Addresses requirement(s)**: FR-001–FR-016
- **Implements design decision(s)**: Requirement traceability and controlled change.
- **Depends on**: T015, T016
- **Likely files**: `specs/002-openaire-trials/spec.md`, `plan.md`, `tasks.md`, `progress.md`, `README.md`
- **Scope boundaries**: Do not mark incomplete requirements done; do not alter unrelated pre-existing modifications.
- **Expected output**: Honest task completion state and evidence ledger; all acceptance criteria accounted for.
- **Verification**: Section-integrity checks for `spec.md` and `plan.md`, task-format/coverage scan, plus listed test outputs.
- **Completion conditions**: No requirement without a task; no task outside approved scope; user handoff reports remaining limitations.
- **Risks / rollback**: Documentation-only convergence updates.

### Worked example

```markdown
## T003: Reject expired invitations during acceptance

- **Objective**: Reject expired invitations at acceptance time.
- **Addresses requirement(s)**: FR-004
- **Implements design decision(s)**: Validation happens in the service layer.
- **Depends on**: T001, T002
- **Likely files**: invitation service, invitation acceptance tests
- **Scope boundaries**: Do not change the invitation expiry duration or alter email delivery.
- **Expected output**: Expired invitations return the defined error; valid invitations continue to work.
- **Verification**: unit test for expired invitation; regression test for valid invitation.
- **Completion conditions**: tests pass; FR-004 acceptance criteria satisfied.
- **Risks / rollback**: Reversible by reverting the service-layer change; no migration.
```

## Task Rules

- Order tasks by dependency; verify each task with the command listed in its detail block.
- Test tasks are included because the spec requires browser and live API evidence.
- No task introduces a new dependency, proxy route, credential, or backend.
- All task changes are reversible local source/test/documentation changes.

## Property-Based Test Tasks

No property-based framework is adopted. P-001 through P-007 are verified with example-based and invariant assertions, as recorded in `plan.md`; no separate property-testing dependency/task is created.

### Worked example

```markdown
## T009: Property test — expired tokens are always rejected

- **Objective**: Prove that any request with an expired token is rejected.
- **Addresses requirement(s)**: FR-004 (P-003)
- **Implements design decision(s)**: The recorded framework decision governs; this feature falls back to example-based tests.
- **Depends on**: T007
- **Likely files**: the example-based test file for this area
- **Scope boundaries**: Do not change token expiry semantics; test only.
- **Expected output**: The expired-token invariant passes for its specified test cases.
- **Verification**: Run the test command recorded for the task.
- **Completion conditions**: P-003 passes and the assertion fails when the behavior is removed.
- **Risks / rollback**: Test-only; revert the assertion file.
```

## Requirement Coverage

| Requirement | Property | Tasks | Covered? |
| --- | --- | --- | --- |
| FR-001 | P-001 | T003, T004, T016 | Yes |
| FR-002 | P-002 | T003, T004, T005, T016 | Yes |
| FR-003 | P-003 | T003, T005, T016 | Yes |
| FR-004 | P-004 | T005, T016 | Yes |
| FR-005 | — | T003, T004, T006, T016 | Yes |
| FR-006 | P-005 | T007, T008, T010, T016 | Yes |
| FR-007 | P-006 | T007, T009, T012, T014, T016 | Yes |
| FR-008 | — | T009, T010, T016 | Yes |
| FR-009 | — | T007, T009, T012, T014, T016 | Yes |
| FR-010 | — | T007, T008, T010, T016 | Yes |
| FR-011 | P-007 | T005, T007, T009, T010, T016 | Yes |
| FR-012 | — | T002, T011, T012, T013, T014, T016 | Yes |
| FR-013 | — | T004, T005, T015, T016 | Yes |
| FR-014 | — | T001, T005, T011–T014, T016, T017 | Yes |
| FR-015 | — | T002, T006, T010, T016 | Yes |
| FR-016 | P-007 | T005, T006, T009, T010, T016 | Yes |
