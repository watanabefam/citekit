# Feature Specification: Web Search Source

**Feature Branch**: `001-web-search-source`

**Created**: 2026-10-19

**Status**: Approved

**Input**: User description: "Can this include a feature similar to exa search? I'm rate limited on exa search and need an alternative. Maybe there are existing repos we can adapt/adopt? Or write something?"

## Document Status

**Status changed:** 2026-10-20 (approved; Web made default-on and Exa-complementary)

**Approved by:** user on 2026-10-20 ("go") · **Authority:** user selected the "Both" path on 2026-10-19 and directed default-on web search on 2026-10-20

**Workflow:** full spec-driven · **Companion:** none

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent research with CiteKit web search alongside Exa (Priority: P1)

A researcher uses an MCP-capable agent for literature and web research. The agent's built-in web search is Exa-backed. The researcher adds CiteKit's MCP server and calls its web-search tool alongside Exa when Exa is available, so web discovery continues when Exa is rate-limited and is broader when both are available.

**Why this priority**: This is the user's immediate blocker. It delivers value with no UI change and no provider key, and it proves the core retrieval path before the in-app experience is built.

**Independent Test**: Spawn the CiteKit MCP server with no Exa credential, call the web-search tool with a known query, and assert that at least one record comes back with a title, URL, and extracted text. The call is independent of any Exa environment variable.

**Acceptance Scenarios**:

1. **Given** CiteKit's MCP server is running with no Exa key, **When** an agent calls the web-search tool with a normal research query, **Then** the agent receives ranked web records with title, URL, hostname, and an extract.
2. **Given** the web provider is rate-limited, **When** an agent calls the web-search tool, **Then** the agent receives a clear, actionable error that names the limit, rather than an empty successful result.
3. **Given** the agent has both a built-in Exa-backed search and CiteKit's tool available, **When** Exa is available, **Then** the agent can include CiteKit web records in addition to Exa results without treating either set as a replacement for the other.
4. **Given** the agent has both a built-in Exa-backed search and CiteKit's tool available, **When** Exa is rate-limited, **Then** the agent can complete the same research task using CiteKit's tool alone.

---

### User Story 2 - Discover and cite web sources in the app (Priority: P1)

A researcher opens CiteKit, where the Web source is already on, searches once, and sees web pages in a clearly labelled section next to the scholarly results. They add a useful page to the working set, ask a question, and receive an answer that cites the page by number and clickable URL.

**Why this priority**: The product value is not just "more search" — it is web discovery that feeds the same citation-grounded answer pipeline. Without this, CiteKit remains a papers-only tool.

**Independent Test**: In a real browser with Web on by default, run a query with a live provider, confirm the Web section appears, add one result, run a dry-run question, and assert that the prompt and source table contain that page's URL and a numbered citation.

**Acceptance Scenarios**:

1. **Given** the Web source is on by default, **When** the user searches, **Then** web results appear in a visually distinct Web section and the scholarly results and their ordering are unchanged.
2. **Given** a web result is added to the working set, **When** the user asks a question, **Then** the source table shows the page title, URL, hostname, and retrieval date, and the answer can cite it as `[n]`.
3. **Given** the Web source is disabled, **When** the user searches, **Then** no web-provider request is made and the existing scholarly behaviour is unchanged.
4. **Given** a web page is cited, **When** the user reads the source table, **Then** the page is labelled as a web page rather than a peer-reviewed paper.

---

### User Story 3 - Raise the limit with an optional key (Priority: P2)

A heavy user hits the keyless provider's limit. They add a free provider key in Settings, and subsequent searches use it. The key stays in the browser; it is never written into the repository.

**Why this priority**: The feature works without a key, but a key is the escape hatch from the keyless limit and the path to predictable daily use.

**Independent Test**: Run a search with no key and confirm keyless mode; save a test key in the settings store and confirm the provider request carries it; run a repository search to confirm the key is not present in tracked files.

**Acceptance Scenarios**:

1. **Given** no provider key is configured, **When** the user searches, **Then** the system uses the provider's keyless mode and explains the limit in the settings hint.
2. **Given** a provider key is saved, **When** the user searches, **Then** the request uses that key and the choice persists across reloads.
3. **Given** a keyless request is rate-limited, **When** the error is shown, **Then** the message explains how to add a free key and continue.

---

### Edge Cases

- The provider returns HTTP 429 (rate limit) or 402/403 (quota or permission).
- The provider returns an invalid or changed response shape.
- The browser blocks the request through CORS, or the network is offline.
- The provider returns zero results for a valid query.
- The same page appears twice with different tracking parameters or URL spelling.
- A web page and a scholarly record have the same title but are different works.
- A result is a PDF, a JavaScript-heavy page, or a paywalled page whose text cannot be extracted.
- A publication date is missing, malformed, or in the future.
- Retrieved text is very long, or the combined prompt would exceed the context budget.
- A web page contains text that looks like instructions to the model.
- The user adds a web result, then removes it from the library or clears the library.
- The user changes provider mid-session, or a search is still running when the provider changes.
- The provider key is invalid, expired, or belongs to a different account.
- The browser's `localStorage` is full or unavailable.
- The provider changes its terms, pricing, CORS policy, or response schema.
- The user cites a web page that has changed or disappeared since retrieval.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: THE system SHALL provide a Web source that is enabled by default and searches the public web for the current query.
- **FR-002**: WHEN the Web source is enabled and the user starts a search, THE system SHALL query the configured web provider once per search and normalize each result into the same record shape used by the scholarly sources.
- **FR-003**: WHILE the Web source is disabled, THE system SHALL make no web-provider request and SHALL preserve existing scholarly search behaviour.
- **FR-004**: THE system SHALL display web results in a visually distinct Web section, ordered by the provider's relevance signal and then by lexical overlap with the query, without changing the scholarly ranking.
- **FR-005**: WHEN web results are included in an answer, THE system SHALL assign citation numbers before the model runs and SHALL render a source entry containing the page title, URL, hostname, and retrieval date.
- **FR-006**: THE system SHALL label web sources as web pages rather than peer-reviewed papers in the source list and in the model prompt.
- **FR-007**: THE system SHALL work with no provider key by default and SHALL accept an optional user key to raise limits.
- **FR-008**: IF the provider returns a rate-limit response, THEN THE system SHALL show an actionable message that names the limit and the free-key option, and SHALL not report an empty result set as success.
- **FR-009**: IF the provider returns an error, an invalid response shape, or a network failure, THEN THE system SHALL report that source as degraded and continue with the other sources.
- **FR-010**: THE system SHALL treat all web page text as untrusted data and SHALL instruct the model not to follow instructions found inside it.
- **FR-011**: WHEN a user adds a web result to the library, THE system SHALL preserve its title, URL, hostname, publication date when available, and extracted text, and SHALL allow the user to remove it like any other library item.
- **FR-012**: THE system SHALL deduplicate web results by canonical URL and SHALL not merge a web page with a scholarly record solely because their titles match.
- **FR-013**: WHERE a provider key is configured, THE system SHALL use it for that provider; otherwise it SHALL use the provider's keyless mode.
- **FR-014**: THE system SHALL cap retrieved and stored text per web result to a documented character limit to protect the answer context.
- **FR-015**: THE system SHALL expose web search through the MCP server as a tool accepting a query, a result limit, and optional domain and time filters.
- **FR-016**: THE system SHALL expose the same web search behaviour through the headless CLI.
- **FR-017**: THE system SHALL keep provider keys in browser `localStorage` or process environment only and SHALL not write them to repository files.
- **FR-018**: THE system SHALL record the provider name and retrieval timestamp on each web result for provenance.
- **FR-019**: WHEN the user changes the web provider in Settings, THE system SHALL persist the choice and apply it to the next search.
- **FR-020**: THE system SHALL preserve the existing public contracts: `window.LL`, the `ll.*` storage keys, the MCP tool names and schemas, and the `[n]` / `[n, p.4]` citation format; the new web tool SHALL be additive.

### Key Entities

- **WebResult**: A page returned by a web provider. Attributes: title, URL, canonical URL, hostname, publication date when available, extracted text or snippet, provider relevance score, provider name, retrieval timestamp, and a flag distinguishing it from a scholarly record.
- **WebProviderConfig**: The user's chosen provider, optional key, optional self-hosted endpoint, and retrieval preferences. Stored locally; never committed.
- **SearchRun**: One query and its combined outcome across scholarly and web sources, including per-source errors, the ordered scholarly results, the ordered web results, and the retrieval timestamp.
- **CitationEntry**: A numbered source entry rendered from the same array used to build the prompt; for a web result it includes the URL and the web-page label.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete the full flow — open CiteKit with Web already on, search, add one web result, ask a question — and receive at least one web citation with a clickable URL in the same session.
- **SC-002**: 100% of cited web sources include a URL in the source table; zero cited web sources lack a clickable link.
- **SC-003**: With the Web source disabled, the existing scholarly test suite passes without modification.
- **SC-004**: An MCP client receives at least one web record for a known query with no Exa credential and no provider key.
- **SC-005**: A simulated 429 produces an actionable message in 100% of runs and never produces a false "no results" state.
- **SC-006**: After implementation, no provider key appears in any git-tracked file, verified by a repository search.
- **SC-007**: For five representative queries on the test machine, the added median latency of the Web source is under 5 seconds compared with the same search with Web disabled.
- **SC-008**: For eight web results, the retrieved text sent to the model stays within the documented per-result cap and within the existing context budget used by the answer pipeline.

## Assumptions

- The initial provider is Tavily. Its keyless search endpoint accepted a browser-origin request with HTTP 200 and CORS headers on 2026-10-19; the implementation re-verifies this from Chromium.
- Tavily's free key provides 1,000 credits per month with no credit card; basic search costs 1 credit and advanced search costs 2, per the provider's published pricing on 2026-10-19.
- Web results are supplementary to peer-reviewed sources. They are not presented as equivalent evidence.
- The Web source is enabled by default; the user can disable it, and the choice persists.
- MVP scope is one provider (Tavily). Jina Search, SearXNG, and a multi-provider fallback chain are future work.
- The installed OpenCode 1.18.30 supports only Exa and Parallel in its built-in web-search tool; the CiteKit MCP tool is the integration point for this feature. The five-provider Tavily documentation applies to a later OpenCode version.
- No backend, build step, or new runtime dependency is introduced. The page remains a single HTML file.
- Web content may be paywalled, JavaScript-heavy, or unextractable; extraction is best-effort and the snippet remains usable.
- Web citations use the existing `[n]` format and have no page-number component.
- Users understand that provider queries leave the browser and are governed by the provider's terms and privacy policy.

## Normative Status

**Normative sections**: User Scenarios & Testing; Requirements; Success Criteria; Validation Plan; Requirement Traceability.

**Informative sections**: Document Status; Normative Status; Requirements Syntax (EARS); Carried Forward; Problem / Opportunity; Goals; Non-Goals; Dependencies and External Contracts; MVP Scope; Future Work; Assumptions.

This spec is authoritative for behaviour. No companion document exists. Where this spec and any future research note disagree, this spec prevails unless it is formally superseded.

## Requirements Syntax (EARS)

Every functional requirement above uses the EARS shapes: ubiquitous (`THE system SHALL …`), event-driven (`WHEN … THE system SHALL …`), state-driven (`WHILE … THE system SHALL …`), optional feature (`WHERE … THE system SHALL …`), and unwanted behaviour (`IF … THEN THE system SHALL …`). `SHALL` is the only normative keyword used for binding behaviour. The informative sections describe rationale and constraints; they do not create requirements.

## Carried Forward

### Confirmed Decisions

- The user chose the "Both" path on 2026-10-19: unblock the agent and add the CiteKit web source.
- The initial provider is Tavily, because it is browser-callable, works keyless, and returns page text in the same request.
- Web results are displayed separately from scholarly results so the deterministic paper ranking keeps its meaning.
- Existing products are not forked. SearXNG, Jina Reader, Firecrawl, and agent-search are backends or references, not replacements for CiteKit.

### Constraints

- The app is a single HTML file with no build step and no runtime dependencies.
- The project's trust model is BYOK; a user key leaves the browser only to the chosen provider.
- No secret may be written into a tracked file.
- Scholarly ranking remains deterministic and explainable; web relevance is an external provider signal and is kept out of the paper score.
- Tools, tests, and the MCP server run the real shipping script through `tools/load-ll.mjs`; there is no second pipeline.
- The proxy's target allowlist and origin rules are unchanged; this feature does not route keys through the proxy.
- Every behaviour change needs a re-runnable test; a green Node run is not proof of browser callability.

### Assumptions

- Tavily's keyless access and CORS policy remain available for the MVP period.
- The provider's free key remains sufficient for personal research use.
- Users have a modern browser with `fetch`, `localStorage`, and network access.
- The existing answer pipeline can accept web records that have no DOI, authors, or citation count.
- The existing library capacity is adequate because web text is capped.

### Risks

- **Keyless rate limiting**: the free tier may throttle heavy use. The optional key and the future fallback chain are the mitigations.
- **CORS or policy change**: the provider could stop allowing browser-origin calls. The browser test is the early warning; a self-hosted fallback is the long-term mitigation.
- **Provider dependence**: Tavily could change pricing, terms, or response shape. The adapter validates shape and reports degraded sources.
- **Content quality**: web pages may be low-quality, outdated, or commercial. The UI labels them as web pages and keeps them out of the scholarly rank.
- **Prompt injection**: page text may contain instructions aimed at the model. The prompt treats all sources as data and explicitly forbids following embedded instructions.
- **Copyright and storage**: storing full page text may have licence implications. The MVP stores only what the user explicitly adds, capped, for personal research.
- **Privacy**: queries leave the browser to the chosen provider. This is disclosed in Settings and the README.

### Open Questions

- None block implementation. Default-on behaviour was chosen on 2026-10-20 and recorded in the requirements; separate display and Tavily-only MVP remain in force.

## Problem / Opportunity

The user's research workflow is blocked by Exa's rate limit. CiteKit searches nine scholarly databases but had no general web source, so it could not cover documentation, news, standards, blog posts, or other non-paper material. This feature adds a Tavily-backed web lane so CiteKit complements Exa when Exa is available and substitutes for it when Exa is limited.

A static, no-backend app cannot use most search APIs: either the browser is allowed to call the provider directly, or the key passes through a server the project owns, which breaks the BYOK custody model. Live probing on 2026-10-19 found that Tavily's search and extract endpoints accept browser-origin requests and return page text with no key, while Exa and Brave do not. That makes Tavily the smallest credible first provider.

The opportunity is to add web discovery to the same citation-grounded pipeline without forking a whole answer engine, adding a crawler, or pretending that a metasearch result is a neural index.

## Goals

- Complement Exa rather than replace it: CiteKit web search is additive when Exa is available and a fallback when Exa is rate-limited.
- Let a user discover web sources and cite them alongside papers in the existing answer flow.
- Work with zero setup by default, and offer a free-key path for heavier use.
- Preserve the scholarly ranking, the existing contracts, and the no-backend architecture.
- Keep web content clearly labelled as non-peer-reviewed evidence.

## Non-Goals

- Cloning Exa's neural index, embeddings, or "find similar" over the open web.
- Crawling, indexing, or storing the public web.
- Replacing or diluting the nine scholarly sources.
- Deep research, multi-step synthesis, or an answer engine separate from CiteKit.
- Jina Search, SearXNG, Brave, Mojeek, or a multi-provider fallback chain in the MVP.
- Semantic reranking with embeddings.
- A browser extension, a server-side search service, or a change to the proxy contract.
- PDF annotation, a document writer, or library sync.
- Committing a provider key or asking the user to paste one into chat.

## Dependencies and External Contracts

- **Tavily Search API** (`POST https://api.tavily.com/search`): keyless mode via `X-Tavily-Access-Mode: keyless`, optional `Authorization: Bearer <key>`, JSON response with `results[]` containing `title`, `url`, `content`, `score`, and optional `raw_content`. The adapter validates the `results` array and treats a missing or changed shape as a degraded source.
- **Tavily Extract API** (`POST https://api.tavily.com/extract`): optional, keyless-capable, returns `results[]` with `url`, `title`, and `raw_content`. Used only if the search response does not provide enough text.
- **CORS**: the feature depends on the provider continuing to allow the app's origin. The implementation verifies this from a real browser, not only from Node.
- **Rate limits and pricing**: keyless access is rate-limited; a free key provides 1,000 credits per month; basic search is 1 credit, advanced search 2 credits, per the provider's pages read on 2026-10-19. These values are provider-controlled and may change.
- **Existing contracts**: `window.LL`, `ll.*` storage keys, MCP tool names/schemas, citation format, and the `tools/load-ll.mjs` loader. New surface is additive.
- **OpenCode 1.18.30**: its built-in web-search tool accepts only Exa and Parallel. The CiteKit MCP server is the integration point; no change to OpenCode's built-in provider is assumed.
- **No new dependency**: Node 18+ global `fetch` and the browser's `fetch` are sufficient.

## MVP Scope

The smallest slice that delivers both P1 stories:

1. A provider-neutral web-search function in the shipping script, with Tavily keyless as the default and an optional key.
2. A Web source checkbox that is on by default, a separate Web results section, and Add-to-library support.
3. Web records in the answer context, with numbered citations, URLs, hostnames, retrieval dates, and a "web page" label.
4. A `search_web` MCP tool using the same implementation, with query, limit, and optional domain/time filters.
5. A CLI path (`--sources web`) using the same implementation.
6. Live tests for provider shape, browser CORS, MCP call, and the disabled-Web regression path.
7. README and Settings text that state the provider, the keyless limit, the free-key option, privacy, and the non-peer-reviewed label.

Everything else is Future Work.

## Future Work (parking lot)

Deliberately deferred. Not part of this feature's acceptance criteria. Must not be implemented without explicit approval.

| # | Idea | Noticed during | Why deferred | Revisit when |
| --- | --- | --- | --- | --- |
| 1 | Jina Search as a second provider / fallback | Research on 2026-10-19: CORS-friendly, 100 RPM with a free key, full page content | MVP needs one provider; Jina's free tier is non-commercial | After Tavily ships and a rate-limit or commercial-use need appears |
| 2 | Self-hosted SearXNG provider | Research on 2026-10-19: no vendor, but needs Docker, JSON config, and CORS | Adds a service and operational burden; not needed to unblock | When the user wants no external search vendor or runs a private instance |
| 3 | Multi-provider fallback chain on 429 | Research on 2026-10-19: rate limits are the original problem | Requires a policy for ordering, cost, and partial failure | When two or more providers are configured |
| 4 | Semantic rerank using the user's embedding key | Constitution's "no embeddings by default" and the paraphrase gap | Adds nondeterminism and cost; the current ranking is explainable | When evaluation shows lexical ranking misses paraphrase on web queries |
| 5 | "Find similar" over the user's library | Exa's `findSimilar` is the closest analogue | Needs embeddings and a library-scale decision; not web search | After the library moves to IndexedDB or embeddings are approved |
| 6 | Firecrawl or a reader for JS-heavy pages | Tavily extraction is best-effort; some pages need rendering | Adds a heavy dependency or service | When extraction failures are measured and material |
| 7 | Web-result caching and offline reading | Library cap is ~5 MB; re-fetching is wasteful | Not needed for the first citation flow | When users repeatedly cite the same pages |
| 8 | OpenCode built-in provider integration | OpenCode v2 documents five providers; 1.18.30 supports two | Requires an OpenCode upgrade or a merged upstream change | When OpenCode 1.18.30 is upgraded or the provider config ships |
| 9 | Web-only answer scope and query expansion | The scope menu currently targets library/results | Adds UI and prompt variants; the MVP can add web results to the working set | After the first web citations are in use |

## Validation Plan

- **Automated tests**:
  - Extend `tests/verify.mjs` with shape/normalisation/dedupe assertions against a live Tavily keyless response; include the disabled-Web regression.
  - Add `tests/web-search.mjs` for provider calls, 429 handling, malformed shape, keyless/keyed selection, and URL dedupe.
  - Extend `tests/browser.mjs` to call the provider from the real page origin in Chromium, assert the Web section, add a result, and assert a dry-run prompt contains the URL and citation number.
  - Extend `tests/mcp-server.mjs` with `search_web`: schema, a live call, and the no-Exa/no-key path.
  - Extend `tests/tools-search.mjs` for `--sources web`.
- **Manual checks**:
  - Run the app with Web off, then on; confirm the scholarly ordering is unchanged.
  - Add a web result, ask a question, click the citation, and confirm the URL opens.
  - Simulate a 429 (or use an exhausted keyless budget) and confirm the message names the free-key path.
  - Try an invalid key and confirm the error is actionable.
  - Try a query with no results and confirm the empty state is honest.
- **Data or migration checks**:
  - Confirm existing `ll.*` settings load with defaults when the new web keys are absent.
  - Confirm clearing the library does not break the provider settings.
  - Confirm the ~5 MB storage budget is not exceeded by capped web text.
- **Security / privacy checks**:
  - Search the repository for any provider key; the expected result is empty.
  - Confirm the provider key is sent only to the provider, never to the proxy or another host.
  - Confirm a page containing an embedded instruction does not change the model's behaviour; the dry-run prompt labels sources as data.
  - Confirm no new proxy target or method is introduced.
- **Performance checks**:
  - Measure added latency for five representative queries and record the median.
  - Measure prompt characters for eight web results at the cap; confirm the existing context budget is respected.
- **Evidence required for approval**:
  - The exact commands run and their output for the Node, browser, MCP, and CLI tests.
  - A Chromium screenshot of the Web section and a cited web source.
  - The CORS probe result from the page origin (status and `Access-Control-Allow-Origin`).
  - The measured latency and prompt-size numbers, not estimates.
  - A repository search showing no key.

## Requirement Traceability

| Requirement | User Story | Acceptance Criteria | Planned Design Area | Task |
| --- | --- | --- | --- | --- |
| FR-001 | US2 | Web source enabled → query returns web records | Source adapter and UI |  |
| FR-002 | US1, US2 | Search → provider called once → normalized records | Source adapter |  |
| FR-003 | US2 | Web disabled → no request; scholarly behaviour unchanged | Search orchestration |  |
| FR-004 | US2 | Web section; scholarly order unchanged | Rendering and ranking |  |
| FR-005 | US2 | Citation numbers assigned before model; URL and date shown | Prompt and source table |  |
| FR-006 | US2 | Web page label in source list and prompt | Prompt and rendering |  |
| FR-007 | US3 | No key → keyless; key → keyed | Settings and provider adapter |  |
| FR-008 | US1, US3 | 429 → actionable message, not empty success | Error handling |  |
| FR-009 | US1, US2 | Error/shape/network → degraded source | Error handling |  |
| FR-010 | US2 | Web text treated as data; no embedded instructions followed | Prompt security |  |
| FR-011 | US2 | Add web result → title/URL/host/date/text preserved | Library |  |
| FR-012 | US2 | Canonical-URL dedupe; no title-only merge with papers | Dedupe |  |
| FR-013 | US3 | Key present → used; otherwise keyless | Provider adapter |  |
| FR-014 | US2 | Per-result character cap | Normalisation |  |
| FR-015 | US1 | MCP tool with query/limit/domain/time filters | MCP server |  |
| FR-016 | US1 | CLI `--sources web` | CLI |  |
| FR-017 | US3 | Keys in localStorage/env only; no repo secret | Settings and tests |  |
| FR-018 | US2 | Provider and retrieval time recorded | Record metadata |  |
| FR-019 | US3 | Provider change persists and applies next search | Settings |  |
| FR-020 | US1, US2, US3 | Existing contracts unchanged; new tool additive | Public contracts |  |
