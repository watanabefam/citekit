# Progress — plan: specs/002-openaire-trials/plan.md · branch: 002-openaire-trials
# Resume rule: implementation tasks were executed; remaining upstream-sensitive regression failures are listed below.

Task T001: complete (branch `002-openaire-trials` confirmed; unrelated pre-existing working-tree changes preserved).
Task T002: complete (shared `tools/load-ll.mjs` harness used; no helper or dependency changes required).
Task T003: complete (`tests/verify.mjs` covers OpenAIRE normalization, malformed shape, review-state aggregation, live query, and dedupe provenance).
Task T004: complete (`index.html` OpenAIRE Graph v4 adapter validates/normalizes publication records, carries IDs/access/attribution, and aggregates instance-level review conservatively).
Task T005: complete (OpenAIRE checkbox defaults off; source uses scholarly dedupe/ranking; OpenAIRE review state and attribution render in the scholarly cards, including when merged).
Task T006: complete (`tests/browser.mjs` verifies default-off zero calls, selected-source calls, and live Chromium-origin API reachability).
Task T007: complete (`tests/verify.mjs` covers trial mapping, status/phase handling, live response, malformed shape, split-lane invariant, and library context).
Task T008: complete (`index.html` ClinicalTrials.gov API v2 adapter validates bounded results and maps typed records, status, phases, NCT identity, canonical URL, and summary).
Task T009: complete (independent `TRIAL_RESULTS` state and separate registry section; status/type/phase/link and efficacy disclaimer render without paper ranking; trial citations export as registry records rather than journal articles).
Task T010: complete (Chromium browser test verifies direct API calls, opt-in behavior, separate trial output and visible fields).
Task T011: complete (`tests/tools-search.mjs` covers source listing, separate trial JSON, trial identifiers/status/URLs, and registry-specific Markdown; live Tavily failure is accepted only as explicit degradation).
Task T012: complete (`tools/search.mjs` exposes both opt-in adapters, keeps trials separate in JSON/Markdown, and accurately distinguishes keyless versus credentialed opt-ins).
Task T013: complete (`tests/mcp-server.mjs` covers live OpenAIRE+ClinicalTrials output and separate typed trial records).
Task T014: complete (`tools/mcp-server.mjs` adds both sources and returns `trials` separately while preserving tool names and required arguments; pre-existing key-custody edits were retained).
Task T015: complete (`README.md` inventory, attribution, registry semantics, CORS evidence, relevance sample, and limitations updated after live probes).
Task T016: complete (verification attempted/rerun; results and unresolved external-service failures below).
Task T017: complete (traceability, defaults, lane separation, attribution and unrelated working-tree ownership reviewed).

## Verification evidence (2026-11-17)

- `node tests/browser.mjs`: **53 passed, 0 failed**. Chromium confirmed both APIs respond HTTP 200 from the served app origin, both controls default off and receive zero requests during default search, selected sources receive requests, OpenAIRE results enter the scholarly lane, and ClinicalTrials renders in its distinct registry lane with the required disclaimer.
- `node tests/mcp-server.mjs`: **20/20 passed**, including live OpenAIRE attribution and separate trial output.
- `node tests/tools-search.mjs`: **34/34 passed**. The OpenAIRE attribution assertion runs against live records; the live keyless Tavily call was rate-limited (HTTP 429) and the test correctly accepted the explicit per-source error rather than requiring a result.
- `node tests/proxy-integration.mjs`: **16/16 passed** after starting the local Wrangler worker at port 8788; no proxy code/policy changed.
- `node tests/verify.mjs`: keyless run **98 passed, 12 failed**, all from live upstream limits: OpenAlex HTTP 429 caused dependent enrichment/dedupe assertions to fail; DOAJ returned 3 results where an older assertion expects at least 5; keyless Tavily was available on the latest run. Earlier runs also saw Europe PMC HTTP 503. New OpenAIRE and ClinicalTrials adapter assertions passed.
- `node tests/verify.mjs` with the existing local OpenAlex and Tavily key files supplied through the app's own `ll.settings` path: **118 passed, 1 failed**. The only failure was the same pre-existing DOAJ result-count expectation (3 returned; assertion requires 5). No key value was printed or written to the repository. This isolates the remaining keyless failures to third-party quota and a stale live-data threshold, not the feature.
- Trial citation export assertions were added for BibTeX (`@misc`, registration note), RIS (`TY - GEN`), CSL-JSON (`webpage`), and APA; a companion assertion keeps paper exports as `article-journal`. All passed.
- `node tests/tools-search.mjs` failures observed before making its Tavily check outage-aware were solely the live Tavily 429; latest run is green.
- `node --check` passed for modified `.mjs` files. Compiling the extracted `index.html` `<script>` with `new Function` passed.

## Measured source check

- Six benchmark queries; up to 15 results each; OpenAIRE DOI / normalized-title matching against the other sources that responded; OpenAIRE's own duplicates collapsed. **63 candidate-new records** were found in the first run. A repeat with the local OpenAlex key available found **64** unique finds (per query: 9, 11, 10, 16, 7, 11); CORE, Semantic Scholar, and arXiv were still intermittently unavailable, so this is a candidate novelty count and may overstate marginal coverage.
- Manual topical screen of five candidates per query (30 total, title plus abstract where available): **30/30 topically relevant** to the query. Two of those 30 had no abstract. This small sample is not a quality/ranking judgment. In the broader candidate-new set, instance review mapping was mixed for 40, peer-reviewed for 13, and not-peer-reviewed for 10; mixed status must not be represented as affirmative peer review.
- Five separate intervention-applicable ClinicalTrials.gov queries returned 10 records each. A query-term topical screen found 45/50 related; 5 were adjacent or off-topic. Registry matches establish neither result availability nor efficacy.

## Remaining caveats

- Full headless regression is not green due to live provider outages/rate limits as listed. Re-run `node tests/verify.mjs` when OpenAlex, DOAJ, and Tavily are available; do not treat provider failures as zero-result behavior.
- Existing unrelated edits/untracked files in `.gitignore`, `AGENTS.md`, `skills/evidence-search/`, and their backup/reference artifacts were not changed or attributed to this feature. `tools/mcp-server.mjs` includes prior key-custody changes preserved alongside this feature.
- No application proxy allowlists, credentials, dependencies, or default source selections were changed.
