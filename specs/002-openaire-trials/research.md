# Research: OpenAIRE and ClinicalTrials.gov Sources

**Date:** 2026-11-17  
**Status:** Informative evidence for [spec.md](spec.md) and [plan.md](plan.md). The spec is authoritative if they disagree.

## Questions and Findings

### 1. Can each API be called directly from CiteKit's actual browser origin?

**Probe:** Served the unmodified app at `http://localhost:8777/` and issued `fetch()` from the shared Chromium preview tab. Both requests parsed JSON successfully, status 200, on 2026-11-17:

- `https://api.openaire.eu/graph/v4/research-products?search=sleep%20circadian%20performance&filter=type:publication&page=1&page_size=3`
- `https://clinicaltrials.gov/api/v2/studies?query.term=exercise%20cognition&pageSize=2&format=json&countTotal=true`

The preview returned a browser-origin fetch success but did not expose a trustworthy `Access-Control-Allow-Origin` header value. The observed successful browser fetch is the callability evidence; no claim is made about a particular header. `tests/browser.mjs` must re-run the fetch from the local app page as a shipping regression. Node-only HTTP success would not satisfy this check.

### 2. What is the current OpenAIRE Graph API v4 query/response contract?

**Primary source:** [OpenAIRE Graph API v4 Research Products](https://graph.openaire.eu/docs/apis/graph-api-v4/research-products/) (accessed 2026-11-17).

- Base endpoint: `https://api.openaire.eu/graph/v4/research-products`.
- Current docs identify `search` as content search over title/abstract, `filter` for predicates, `page` for offset pagination, `page_size` range 1–100, and `select` for sparse field sets.
- Documented peer-reviewed example uses `filter=type:publication,is_peer_reviewed:true,best_oa.rights:Open Access`.
- Response has `header` and `results[]`; header includes counts, page, page size, and query timing.
- Offset paging is capped at 10,000 results per query according to [Graph API docs](https://graph.openaire.eu/docs/apis/graph-api/); v1 only needs one bounded page.

**Live response check:** The v4 endpoint returned HTTP 200 with `header` and `results` for all six benchmark queries (five records per query). Returned publication entities expose `id`, `mainTitle`, `publicationDate`, `authors`, `pids`, `descriptions`, `container`, `bestAccessRight`, `instances`, and related fields. Different records omitted optional values such as descriptions or instance data; normalization must be null-safe.

The first live sleep record had a DOI and two useful repository/publisher URLs, but its instances reported both `peerReviewed` and `nonPeerReviewed`. Additional benchmark records also showed mixed flags. Thus review state is **instance-level**; a work-level `peerReviewed: true` chosen by majority or first-instance precedence would be unsupported. Plan maps consistent values to a supported status and conflicts to `mixed`.

**Search semantics:** Earlier experimentation queried a `title=` parameter; current primary docs prescribe `search` (full text title+abstract), with `filter=type:publication`. Adapter should use the documented current form and validate actual output.

### 3. What are the OpenAIRE reuse and attribution terms?

**Primary source:** [OpenAIRE Graph API v4 Terms of Use](https://graph.openaire.eu/docs/11.4.0/apis/terms/) and [OpenAIRE Graph License](https://graph.openaire.eu/docs/next/license/) (accessed 2026-11-17). The terms page says public API records may be reused by commercial and non-commercial partners under CC-BY provided OpenAIRE is acknowledged as a data source. The license page describes the Graph as CC-BY with some CC0 components. Current documentation says unauthenticated use is free with a stated hourly rate limit; no key is needed for MVP. Verify the live terms at implementation time because the docs can change.

### 4. What is the ClinicalTrials.gov API v2 shape and access path?

**Primary sources:** [API Reference](https://clinicaltrials.gov/data-api/about-api/api-reference), [Study Data Structure](https://clinicaltrials.gov/data-api/about-api/study-data-structure), and [API migration](https://clinicaltrials.gov/data-api/about-api/api-migration) (accessed 2026-11-17).

Live request with `query.term`, `pageSize`, and `format=json` returned HTTP 200 JSON with `totalCount`, `studies[]`, and optional `nextPageToken`. Each study nests data under `protocolSection`; observed fields included:

- `identificationModule.nctId`, `briefTitle`
- `statusModule.overallStatus`
- `descriptionModule.briefSummary`
- `designModule.studyType`, `phases[]`

Canonical link is constructed as `https://clinicaltrials.gov/study/{NCTId}`. The API sample returned current status strings such as `RECRUITING`, and `NA` as a phase sentinel. Preserve exact raw status and omit unavailable phase instead of presenting `NA` as a meaningful phase.

### 5. How does current CiteKit ranking and integration constrain design?

**Repository evidence:**

- `index.html:294-315`: `rankScore` uses lexical relevance, citation count, readable/full-text availability, OA; consensus is display-only and explicitly not scored.
- `index.html`: `SOURCES` are selected by checkboxes and settled independently; `splitSearchRecords` separates trials and web before scholarly dedupe/ranking. Trials have `TRIAL_RESULTS` state.
- `index.html:1027-1082`: scholarly and web render separately; paper cards can be ingested to library.
- `index.html:1083`: library preserves `kind` field.
- `tools/load-ll.mjs`: tools use the real shipping script.
- `tools/mcp-server.mjs`: MCP search merges/dedupes/ranks scholarly source results and exposes trial records separately under `trials`.
- `tools/search.mjs:125-160, 197-223`: CLI source registry, selection, concurrent search, and distinct web/paper handling.
- `tests/browser.mjs`: Chromium verifies ten scholarly sources, one trial registry source, and web; new sources are unchecked by default.
- `tests/verify.mjs`, `tests/mcp-server.mjs`, and `tests/tools-search.mjs` are existing coverage points.

**Design implication:** Trials need their own collection before paper dedupe, rank, enrichment, and citation expansion. OpenAIRE records use the paper path; source consensus must remain unscored. The enumerated source names and expected UI count must be updated across the app, CLI, MCP, and tests.

## Live Query Snapshot

OpenAIRE v4 `search=<benchmark query>&filter=type:publication&page=1&page_size=5` returned HTTP 200 for all six queries. `header.numFound` values observed in this sample were 3203 (sleep), 799 (exercise), 341 (habit), 2688 (stress), 589 (virtue ethics), and 245 (spirituality). These are raw provider counts, not relevant-result counts and not marginal value measurements.

The initial benchmark confirmed candidate-new titles in each domain but did not establish relevance. After implementation, the six-query sample and limited manual topicality review are summarized in README and `progress.md`; novelty counts are limited by intermittent baseline-source failures.

ClinicalTrials.gov returned HTTP 200 in both the original and repeatable Chromium app-origin test. The broad `exercise cognition` query had 5118 records at observation time, illustrating that provider count is not a precision measure. The implemented adapter applies a bounded page; the separate five-query topicality screen is summarized in README and `progress.md`.

## Sources

- OpenAIRE v4 products: https://graph.openaire.eu/docs/apis/graph-api-v4/research-products/
- OpenAIRE query filtering: https://graph.openaire.eu/docs/11.4.0/apis/graph-api/research-products/filtering/
- OpenAIRE Graph API paging/terms: https://graph.openaire.eu/docs/apis/graph-api/
- OpenAIRE current API terms: https://graph.openaire.eu/docs/11.4.0/apis/terms/
- OpenAIRE license: https://graph.openaire.eu/docs/next/license/
- ClinicalTrials.gov API reference: https://clinicaltrials.gov/data-api/about-api/api-reference
- ClinicalTrials.gov study schema: https://clinicaltrials.gov/data-api/about-api/study-data-structure
- ClinicalTrials.gov API migration notes: https://clinicaltrials.gov/data-api/about-api/api-migration
