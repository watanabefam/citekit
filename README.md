# CiteKit

A self-contained academic research workspace that runs entirely in the browser: **nine scholarly
databases, deterministic ranking, and citation-grounded answers through your own model key**. No
backend, no build step, no account — one HTML file. Search ~300M works, ingest your own PDFs, and
every claim comes back with a numbered citation you can click through.

```bash
git clone https://github.com/watanabefam/citekit.git && cd citekit
python3 -m http.server 8777        # or just double-click index.html
open http://127.0.0.1:8777/index.html
```
(An `http://` origin is needed rather than `file://` if you use the optional proxy —
browsers send no `Origin` header to `file://`, which some APIs require.)

Then: **Settings** → pick provider → paste key → search → tick papers → *Add +* → ask questions.
Tick **dry run** first if you want to see the exact prompt before spending tokens.

`node tests/verify.mjs` runs 87 behavioural assertions against live APIs and fake SSE providers.
`tests/browser.mjs` (40 assertions) drives real Chromium; `tests/proxy-integration.mjs` (16) verifies
the optional Cloudflare Worker against the real workerd runtime; `tests/mcp-server.mjs` (17) speaks
the MCP protocol over stdio to the real server.

---

## Design: what each part runs on

Commercial AI research assistants are thin orchestration layers over free bibliographic APIs plus a
model you already pay for. This is that teardown, part by part.

| Capability | What the commercial tools run on | What CiteKit uses |
|---|---|---|
| **Semantic literature search** ("200M+ peer-reviewed papers") | Semantic Scholar Graph API | **OpenAlex** (primary, CORS-open) + Crossref, Europe PMC, PubMed, **ERIC**, **DOAJ**, **CORE**, Semantic Scholar, arXiv |
| **Web search mode** | a search API | not included — OpenAlex full-text search covers the scholarly half; add Brave/Serper/Tavily on the same pattern if you want the web half |
| **Chat with your own papers** (quotes + page numbers) | embeddings + vector store + LLM | **page-level BM25-ish scoring** (deterministic, no embeddings) + pdf.js text extraction + your LLM with `[n, p.4]` citations |
| **Model choice** (OpenAI / Anthropic / Gemini tiers) | vendor keys, vendor markup | **your key**: OpenRouter, OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, DeepSeek, Groq…) |
| **Reference manager** (folders, tags, citation styles) | Zotero-style library | local library in `localStorage` + **BibTeX / RIS / CSL-JSON / APA export** (imports into Zotero, Paperpile, EndNote) |
| **10,000+ CSL citation styles** | the open CSL style repo | a 5-style formatter built in; swap in `citeproc-js` + [citation-style-language/styles](https://github.com/citation-style-language/styles) when you need the full set |
| **PDF annotator** | a PDF reader | pdf.js (text layer only today — the annotation layer is the obvious next commit) |
| **Document writer with autosuggest** | LLM + their citation store | not included; the citation exporters are what a writer needs |

**That is the whole architecture** — free bibliographic APIs, a deterministic selection step, and a
model you supply. Nothing here reimplements a proprietary index.

## Verified facts this design depends on (probed, not assumed)

| Endpoint | Key? | Browser-callable (CORS)? | Cost |
|---|---|---|---|
| `api.openalex.org` | optional | ✅ `Access-Control-Allow-Origin: *` | $0.10/1k list calls, **$1/1k searches**; anonymous = $0.10/day (~1000 free calls), free key = **$1/day** |
| `api.crossref.org` | no | ✅ `*` | free |
| `ebi.ac.uk/europepmc/webservices` | no | ✅ `*` | free |
| `eutils.ncbi.nlm.nih.gov` (PubMed) | no | ✅ `*` | free |
| `api.ies.ed.gov` (ERIC — education) | no | ✅ `*` | free |
| `doaj.org/api` (gold OA journals) | no | ✅ `*` | free |
| `api.core.ac.uk` (300M+ OA works) | **yes in practice** | avoids wildcard CORS but 🚫 keyless = tiny shared quota → **429** | free key required for real use |
| `api.semanticscholar.org` | recommended | ❌ **no CORS header**; anonymous pool returns **429** | free key = 1 rps dedicated |
| `export.arxiv.org/api` | no | ❌ no CORS header | free |
| `openrouter.ai/api/v1` | yes | ✅ `*` | your key, 400+ models |
| `api.anthropic.com` | yes | ✅ `*` **only with** `anthropic-dangerous-direct-browser-access: true` | your key |
| `api.openai.com` | yes | ✅ `*` | your key |
| `generativelanguage.googleapis.com` | yes | ✅ origin-reflected | your key |

Consequences baked into the code:

- **OpenAlex is the backbone** — richest metadata, abstracts reconstructable from
  `abstract_inverted_index`, `best_oa_location.pdf_url` for open-access PDFs, and
  `fulltext.search` which matches title + abstract + **full text**.
- **Semantic Scholar and arXiv need a CORS proxy.** `proxy/worker.js` is a Cloudflare
  Worker that unlocks both (and can hold your S2 key server-side — paste its URL into
  Settings → Proxy URL; either form works, `https://<worker>.workers.dev/` or `.../?url=`, and the
  target is checked against an allowlist either way). Without it the app tells you so instead of
  failing silently.
- **OpenAlex now meters usage** ($1 free/day, `meta.cost_usd` on every response). Fine for
  interactive research — a 100-result search costs $0.001 — but don't loop it.
- OpenAlex **content API** serves cached PDFs at $0.01/file (100/day free) if you want to build a
  local corpus instead of link-scraping.

## Other scholarly sources — evaluated, and what happened

CORS + key requirement decide it for a static page. Everything here was probed live.

**Added (all browser-callable, no backend):**

| Source | Scope | OA angle | Notes |
|---|---|---|---|
| **ERIC** (`api.ies.ed.gov`) | 41k+ education hits for a RAG query, 4.4k for "structured literacy" + dyslexia | mixed — ED#### records usually serve a free PDF at `files.eric.ed.gov/fulltext/<id>.pdf`; **per-record, not uniform** (verified: some 200, some 404) | the education index; abstracts are long and research-grade; `peerreviewed` flag; OR-query syntax |
| **DOAJ** (`doaj.org/api`) | ~20k journals, gold OA only | **100% open access by construction**, with free full-text links | bare multi-word queries are **AND** (4 words → 2 hits), so the adapter retries as OR when results are thin |
| **CORE** (`api.core.ac.uk`) | 300M+ works from OA repositories | **OA only**, and `downloadUrl` gives direct PDFs | ⚠️ **needs a free API key.** Keyless access rides a small anonymous quota that returned 429 after a handful of probes (verified twice, browser or not) — an earlier "works keyless, CORS is origin-reflected" reading was wrong: it was just the first request of the allowance |

**Evaluated and rejected:**

| Source | Why not |
|---|---|
| **BASE** (400M+, ~60% OA) | API access is registration + IP allowlist — unusable from a browser, and pointless behind a shared worker |
| **OpenAIRE** | Good OA coverage but **no CORS headers**, and it overlaps OpenAlex heavily — not worth a proxy hop |
| **Internet Archive Scholar / fatcat** | Search endpoint 302s with no CORS; no clean JSON API |
| **Zenodo / DataCite** | Excellent OA, but they index *datasets and software*, not literature — wrong axis for a paper search UI |
| **bioRxiv / medRxiv** | Their API serves by DOI or date window, **not by keyword** — can't back a search box. Europe PMC already indexes preprints (PPR records), so this gap is covered anyway |
| **OSF preprints** | API returned HTTP 500 on probe — not dependable |
| **Scopus, Web of Science, Dimensions, APA PsycNET** | Commercial, paid, contract-gated |
| **Google Scholar** | No public API; scraping violates ToS. The honest answer is don't |
| **HAL** (France) | ✅ CORS-open and works — omit only because it duplicates OpenAlex for most English-language work. One adapter if you want French OA |
| **PMC OA subset / BioC** | Already reachable via Europe PMC, which the app already queries |

If you want one more, the best candidate is **HAL** (works, CORS-open, adds francophone OA) — but the higher-value next step for your domain is not another index, it's **citation-graph walking**: take a seed paper and pull its references + citing works through OpenAlex (`referenced_works`, `cites:`), which finds relevant literature no keyword search will.



## MCP server — use it from any agent

`tools/mcp-server.mjs` exposes the pipeline over the Model Context Protocol, so an agent uses
CiteKit **by tool name** instead of fetching files and rebuilding a directory layout. Zero
dependencies, deliberately: it is a thin adapter over the same `loadLL()` loader the CLI uses, so
it runs `index.html`'s real shipping code — there is no second implementation to drift.

```bash
CITEKIT_OPENALEX_KEY=… node tools/mcp-server.mjs   # a client normally spawns this itself
```

Three tools:

| Tool | What it does |
|---|---|
| `search_literature` | Nine sources at once, deduped, deterministically ranked |
| `expand_citations` | One level of citation-graph walking, both directions, provenance-tagged |
| `get_record` | Resolve a DOI to a full metadata record |

A client needs the command and the environment, nothing else:

```json
{ "mcpServers": { "citekit": {
  "command": "node",
  "args": ["/absolute/path/to/citekit/tools/mcp-server.mjs"],
  "env": { "CITEKIT_OPENALEX_KEY": "…" }
} } }
```

Put the key in `env` rather than on a command line — process arguments are readable by every
user on the machine. Five of the nine sources need no key, so the server is useful unkeyed with
the small anonymous OpenAlex allowance. Requires Node 18+ (global `fetch`).

`tests/mcp-server.mjs` (17 assertions) spawns the server and speaks the real protocol rather
than assuming it: lifecycle and version agreement, capability declaration, tool schemas, the
`-32602`/`-32601` error paths, the rule that a notification is never answered, two live tool
calls, and stdio shutdown.

## Architecture

```
index.html ──┬─ adapters ──► OpenAlex / Crossref / Europe PMC / PubMed / ERIC / DOAJ / CORE (direct fetch, CORS)
             │                Semantic Scholar / arXiv                   (via proxy/worker.js)
             ├─ dedupe ─────► DOI → title-normalised merge, provenance kept per record
             ├─ library ────► metadata records (abstract) + full-text records (pdf.js pages)
             ├─ retrieval ──► deterministic term-frequency page/section ranking (no embeddings)
             ├─ prompt ─────► numbered [n] SOURCE blocks + strict citation-only system prompt
             ├─ LLM ────────► BYOK: OpenAI-compatible | Anthropic Messages | Gemini SSE
             └─ export ─────► BibTeX, RIS, CSL-JSON, APA
```

Design choices worth keeping if you extend it:

1. **No embeddings by default.** Term-frequency page ranking is deterministic, instant, free, and
   explainable; for a 500-page library it beats a naive RAG pipeline. Add embeddings only when the
   library is large enough that lexical overlap misses paraphrase.
2. **Citation numbers are assigned before the model runs.** The model can only cite blocks that
   exist, and the source table is rendered from the same array — so a hallucinated `[7]` in a
   5-source answer is visibly wrong.
3. **Everything is in the page.** No key ever leaves the browser except to your chosen provider.
   (Which also means: `localStorage` keys are readable by any script on that origin — use a scoped
   key, and don't host this on a domain you don't control.)

## Headless search — `tools/`

The whole pipeline (adapters → dedupe → OpenAlex enrichment → ranking) runs without a browser:

```bash
node tools/search.mjs "structured literacy dyslexia" --per 8 --json --out candidates.json
node tools/search.mjs --queries tests/queries.json --sources openalex,eric --per 5
node tools/search.mjs "montessori lottery outcomes" --sources openalex,eric --oa-only --year-from 2015
```

`tools/load-ll.mjs` loads `index.html`'s **real shipping script** under a DOM stub (the same
technique `tests/verify.mjs` uses), exposed as `LL`. `tools/search.mjs` runs one or more queries
across the keyless sources and prints **complete records** — authors, year, venue, DOI, OA status,
PDF link, citation count, abstract.

Why it exists: driving the adapters from Node previously meant writing a throwaway stub *and*
printing a hand-picked subset of each record. Omitting `authors` is exactly how a citation gets
mis-attributed by hand downstream — this CLI prints the whole record so an **intake workflow**
(candidate generation → primary-source verification) never reconstructs metadata from memory.

Flags: `--per N` · `--sources csv` · `--oa-only` · `--year-from YYYY` · `--json`/`--md` ·
`--out FILE` · `--no-enrich` (skip the metered OpenAlex pass) · `--queries FILE` · `--list-sources`.
Default sources are the keyless/CORS-open set; `s2`, `arxiv` (need the proxy) and `core` (needs a
key) are opt-in. `node tests/tools-search.mjs` smoke-tests it.

## Ranking: deterministic, measured, and one signal rejected

No model call. `rankScore()` scores each candidate from four signals and `rankResults()`
sorts the list; `buildContext()` uses the same score to choose what the model actually reads.

| Signal | Weight | Why |
|---|---|---|
| Lexical overlap (title + abstract) | 1.0 | length-stable: title-term match, abstract-term match, and term density; each bounded so it composes predictably |
| Citations (log-scaled, capped at 10k) | 0.30 | the best available quality proxy |
| Full-text link present | 0.45 | the tool quotes sources; an unreadable record is worth much less |
| Open access | 0.15 | ditto, weaker signal |

**Trialed and rejected: cross-source consensus.** It sounded right — a paper found by
Crossref *and* Europe PMC *and* PubMed *and* ERIC must be good — and it is measurably wrong:

```
single-source records : 99 records, mean 70 citations
multi-source records  :  7 records, mean  5 citations
```

Only ~7% of the merged pool is returned by more than one source, and those records are the
*obscure* ones. Scoring consensus made results worse (open access 3/8 → 1/8). It is now shown
as a pill (`4 sources`) and deliberately excluded from the score — there is a regression test
asserting it does not affect ranking. **Recency is likewise not scored**: landmark
reading-science work does not expire.

A second real bug this surfaced: the first version reused `scorePage()` for ranking, which
divides by √word-count, so a 10-word title outscored a 1,500-word abstract and the top-8
filled with short titles that happened to echo the query. The lexical term is now
length-stable, which is what took full-text availability of the selected set from
3/8 → 8/8.

Measure it yourself:

```bash
node tests/rank-value.mjs                                    # old vs new ranking, live data
node tests/rank-value.mjs "your own query"                   # any query
node tests/source-value.mjs                                  # per-source marginal value + OA coverage
```

Caveat worth stating: those scripts measure the **composition of what gets fed to the model**
(availability, citation mass, source coverage). Whether *answers* improve needs labelled
evaluation — this is not that. Weights were tuned on two queries, so treat them as defensible
directions, not validated constants.



## Citation-graph walking — one level, both directions

Opt in with **expand via citations**. After a search, the top 5 results become seeds and CiteKit
walks the citation graph one level in each direction:

| Direction | How | Cost |
| --- | --- | --- |
| **Forward** — who cites the seed | OpenAlex `filter=cites:<id>` | $0.0001 per page of **200** |
| **Backward** — what the seed cites | `referenced_works` on the work itself (a **free** lookup), then one batched `openalex_id` hydration per 50 refs | free + $0.0001 |

Seeds with no OpenAlex id are resolved by DOI in a single batched call, so a Crossref or ERIC
record is walkable too. Every expanded record carries provenance (`cites-seed` / `cited-by-seed`
plus the seed's title), is de-duplicated against the primary results, and is capped: 5 seeds, 200
forward results per seed, 50 backward refs per seed.

Read honestly:

- **One level is deliberate.** Backward multiplies ~50× per paper and forward by the citation
  count, so a second level explodes. The review literature (TARCiS/PRISMA-S — Cochrane makes
  backward searching a mandatory step) is consistent that one level is what pays.
- **Supplementary, never a replacement.** Standalone citation searching is documented to *miss*
  literature that keyword search catches; what it adds is the terminologically disconnected work.
  Hence a checkbox, not a default.
- **Page size is free, so the pages are big.** A page of 200 citing works costs the same as a page
  of 1 — small pages are pure waste. That rule is asserted rather than assumed.
- **Verified against the stub AND live.** `node tests/citation-walk.mjs` (12 assertions, no
  network) covers the code path; `node tests/citation-walk-live.mjs` (7 assertions) drives the real
  walker against OpenAlex with a key — last run 413 records, 345 forward / 68 backward, 51% with a
  PDF link. That live run found a duplicate-collapse bug the stub could never have caught: a paper
  can cite one seed and be cited by another, so the same work arrived twice.
- **Still not exercised: the checkbox in the browser UI.** Both suites call `expandCitations`
  directly; the toggle, the merged re-rank and the status line have no automated coverage yet.

## Evaluation: what is actually measured, and how well

`tests/eval-ranking.mjs` implements the conventions the IR literature uses: **depth-k pooling**
(judge the union of the top-8 from every ranking variant compared), **graded relevance 0-3**,
**nDCG@8** as the primary metric with **bpref** and P@5/P@8 alongside, and a **train/test split of
queries** so weights are chosen on one half and reported on the other. Queries and rubric live in
`tests/queries.json`.

Judgments resolve in order of authority:

1. **`tests/judgments.json` — hand adjudication.** All 195 pooled documents were read (title,
   venue, year, abstract) and graded strictly, and the file is committed, so the numbers below
   reproduce without spending anything.
2. **`tests/judgments.model.json` — cached model verdicts**, written by `--judge-model` and reused
   on later runs. Bring your own key; nothing is sent anywhere by default.
3. **The rule-based rubric** in `tests/queries.json` — the fallback, and the thing this harness
   exists to distrust.

```bash
node tests/eval-ranking.mjs                                  # hand judge, rubric as fallback
node tests/eval-ranking.mjs --judge-model gpt-4o-mini --provider openai \
     --llm-key "$KEY" --judgments pool.json                  # model judge (BYOK)
```

### The blunt ruler was changing the answer

Same 12 queries, same pools, two judges:

| variant | TRAIN nDCG@8 (rubric → hand) | **TEST nDCG@8 (rubric → hand)** | TEST bpref |
|---|---|---|---|
| legacy (abstract-only + citation nudge) | 0.762 → 0.763 | **0.837 → 0.828** | 0.326 |
| current (lexical + citations + readability) | 0.972 → **0.853** | **0.946 → 0.939** | 0.467 |
| v1 (consensus + recency — the variant dropped) | 0.958 → 0.877 | **0.967 → 0.924** | 0.504 |

Read honestly:

- **The rubric inflated the ranking rewrite's advantage on the training half more than two-fold.**
  It showed `current` beating `legacy` by 0.210 nDCG@8; hand adjudication shows 0.090. The held-out
  conclusion survives — `current` still beats `legacy`, 0.939 vs 0.828, so the rewrite is validated
  — but by roughly half the margin the rubric implied.
- **The hand judge downgraded 36 of 195 documents** (rubric 99% ≥2 → 92%), exposing two failure
  modes the rubric was blind to:
  - **Domain-word collisions.** For *teacher professional development literacy instruction*, the
    rubric graded **AI literacy** and **ICT literacy** papers as fully relevant — the word
    "literacy" appears, the topic does not. Same for *retrieval augmented generation*, where a
    memory-research paper about **retrieval practice** scored as on-topic. This is a lexical
    failure mode, and d4 — the query containing the collisions — is where the ranking scores worst
    (0.63 / 0.47 / 0.57). The tool's weakness and the judge's were the same weakness.
  - **Adjacent populations.** Signed reading fluency in deaf students; morphological awareness in
    *college* students. Same construct, wrong population.
- **Much of the remaining leniency is the pool, not the judge.** Even after adjudication, 92% of
  pooled documents grade ≥2, because a depth-8 pool is drawn from systems that already return good
  results — it holds few non-relevant documents *by construction*. That is also why **bpref is n/a
  for 1/6 train and 3/6 test queries**: with nothing judged below 2 there is no non-relevant
  document to rank against. Deeper pooling buys more discrimination than a stricter judge alone.
- **The rejected consensus variant is not topically worse** — competitive under both judges and
  best on bpref. It was dropped for availability, not topicality: it promoted records with no
  full-text link (8/8 → 1/8). Two metrics disagreeing is the useful part.
- **12 queries is under-powered.** The literature puts a stable system ranking at ~83 queries (MTC)
  or 30-60 judgments/query across ~100 queries. Treat everything above as directional.

### Pool depth: the budget is the constraint, not the algorithm

`tests/eval-ranking.mjs` pools for judging at `--pool-depth` (default 8) and measures at cutoff 8 —
deliberately different parameters, because pooling deeper than you measure is what stops a variant
being rewarded for documents nobody judged. `--pool-strategy depth|mtf` switches to **move-to-front
pooling** (Cormack & Buettcher), which reaches a target pool *size* even when runs overlap, where
fixed depth silently yields a shorter pool.

`tests/pool-depth.mjs` re-pools an existing dump offline — **zero API calls** — which matters
because OpenAlex meters at **$0.001/call against a $0.10/day anonymous budget (~100 calls/day,
per IP, shared)**. A couple of eval runs exhaust it. Measured at equal adjudication cost:

| pool/query | strategy | added vs depth-8 | unjudged | median best-variant rank of the added docs |
|---|---|---|---|---|
| 17.4 | depth (baseline) | — | — | — |
| 17.0 | mtf | 1.0 | 1.0 | 10 |
| 23.4 | depth | 6.0 | 5.6 | 10 |
| 31.5 | depth | 14.1 | 13.5 | 13 |
| 50.7 | depth | 33.3 | 32.4 | 23 |

Read honestly:

- **Volume buys progressively deeper documents**: what enters at ~17/query sits at median rank 10
  in its best variant, and at ~51/query it is down at rank 23. Each one costs a judgment.
- **MTF and fixed depth add the same volume at equal cost** (1.0 vs 0.0, 5.7 vs 6.0, 14.6 vs 14.1).
  MTF's documented benefit is lower *bias* in system comparisons — a property 12 queries cannot
  measure, so it stays in the code documented as untested here rather than claimed as a win.
- **Doubling the pool costs ~400 more human judgments** across 12 queries. That is the real price
  of "more volume", and it is a person (or a paid model), not an API call.

- **Rendering is asserted, not eyeballed** — a Playwright pass drives real Chromium at three viewports
  (horizontal overflow, layout proportions, the Ask box staying on screen) and writes screenshots to
  `tests/screenshots/`.
- Semantic Scholar + arXiv need the worker deployed.
- Library is `localStorage` (~5 MB) — full-text PDFs will fill it; move to IndexedDB for volume.
- No PDF annotation layer, no document writer, no Google mode.
- Single-user, no sync.

## Accessibility

A data-dense two-pane UI is easy to get wrong for keyboard and screen-reader users, so the browser
suite asserts the mechanics rather than trusting them — 15 of its assertions exist for this.
Following the W3C ARIA Authoring Practices and WCAG 2.2:

| Criterion | What changed |
| --- | --- |
| 2.1.1 Keyboard | The Discover/Library switcher was `div` + `onclick`, so keyboard users could not switch views at all. It is now an APG tablist: roving tabindex, Enter/Space to activate, Left/Right to move. |
| 2.4.1 Bypass Blocks | A skip link — the first focusable element on the page, off-screen until focused — targeting a now-focusable results region. |
| 2.4.7 Focus Visible | An explicit `:focus-visible` ring; the dark custom-coloured buttons left the UA default low-contrast against `--panel`. No rule anywhere strips the outline. |
| 4.1.2 Name, Role, Value | Named landmarks (both panes, a `role="search"` query row), `role="tab"` + `aria-selected` + `aria-controls` on the tabs, and an `aria-label` on the query input — a placeholder is not a label. |
| 4.1.3 Status Messages | The result count is a `role="status"` live region that exists at page load (never injected later), and the results region carries `aria-busy` while a search is in flight. |

What this does **not** prove: no screen reader has been driven, and live-region announcement timing is
the part automation is worst at. Necessary, not sufficient.

## Known gaps (honest list)

- **The judge is a person once, not a procedure.** `tests/judgments.json` is a single hand
  adjudication — it is not reproducible by a third party, and it cannot grow with the query set
  without someone reading another few hundred abstracts. The `--judge-model` path exists to scale
  it; no model judge has been run against this pool yet, so the two have never been compared.
- **Keyboard and focus behaviour are asserted, but no screen reader has been driven.** Tab semantics,
  focus order, live regions and the skip link are covered by tests (see Accessibility below); a real
  VoiceOver/NVDA pass has not been run, and announcement timing is the part automation is worst at.
- **Semantic Scholar still needs a key.** The proxy does *not* fix its shared-pool 429 (verified
  from Cloudflare's IP too). Same for **CORE**, whose anonymous quota 429s after a handful of
  requests. Both need free keys; neither is optional in practice.
- **ERIC full text is per-record** — the `files.eric.ed.gov/fulltext/<id>.pdf` link is a
  convention that many, not all, `ED####` records satisfy (verified: some 404).
- **OpenAlex search costs money** ($0.001/call, $1/day free with a key; ~1000 anonymous calls).
  Fine interactively, don't loop it.
- **Workers cannot fetch private/localhost addresses**, so the proxy can never reach a local
  model server — local LLMs are only usable browser-direct.
- Library is `localStorage` (~5 MB) — full-text PDFs will fill it; move to IndexedDB for volume.
- No PDF annotation layer, no document writer, no web/Google mode.
- Single-user, no sync.

## Build vs assemble — if you'd rather not own a codebase

You do not have to build this. Whole open-source products already do most of it, BYOK:

- **[PaperQA2](https://github.com/Future-House/paper-qa)** (Apache-2.0) — agentic RAG over
  scientific PDFs with grounded in-text citations, any LiteLLM provider — the same
  chat-with-your-own-papers idea, done with metadata-aware embeddings, LLM re-ranking and
  contradiction detection.
- **Zotero + a CSL style set** — the reference manager and the real 10,000 citation styles, free.
- **gpt-researcher / STORM** — report generation with citations across web + academic retrievers.

Rule of thumb: assemble if you mostly need *reading and citing*; keep this file if you want
*discovery → grounded answers → export* in one static page you control end to end.

## Next commits (in value order)

1. **Deploy the worker** to a Cloudflare account (`cd proxy && wrangler deploy`), then paste the
   URL into Settings → Proxy URL. Built and verified locally against the real workerd runtime;
   only the deploy needs an account. While there: `wrangler secret put S2_KEY` and `CORE_KEY`
   so the two key-gated sources actually work.
2. A real screen-reader pass (VoiceOver/NVDA). The automated assertions cover roles, live regions,
   focus order and keyboard operability, but no screen reader has actually been driven.
3. IndexedDB library with per-paper embeddings for large corpora.
4. `citeproc-js` + CSL styles for real 10,000-style bibliographies.
5. Deeper pooling (k=20 rather than 8) and grow the query set toward the ~80 the literature says
   a stable system ranking needs. The judge is no longer the bottleneck: even after hand
   adjudication 92% of pooled documents grade >=2, because a depth-8 pool barely contains
   non-relevant documents at all. Also worth running `--judge-model` once to compare a model's
   verdicts against the hand grades — the machinery is built and has never been exercised.
6. Brave/Serper "web mode" adapter (same interface as the other sources).
