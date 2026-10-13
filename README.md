# CiteKit

A self-contained academic research workspace that runs entirely in the browser: **nine scholarly
databases, deterministic ranking, and citation-grounded answers through your own model key**. No
backend, no build step, no account — one HTML file. Search ~300M works, ingest your own PDFs, and
every claim comes back with a numbered citation you can click through.

```bash
cd ~/Documents/GitHub/citekit
python3 -m http.server 8777        # or just double-click index.html
open http://127.0.0.1:8777/index.html
```

Then: **Settings** → pick provider → paste key → search → tick papers → *Add +* → ask questions.
Tick **dry run** first if you want to see the exact prompt before spending tokens.

`node tests/verify.mjs` runs 87 behavioural assertions against live APIs and fake SSE providers.
`tests/browser.mjs` (25 assertions) drives real Chromium; `tests/proxy-integration.mjs` (13) verifies
the optional Cloudflare Worker against the real workerd runtime.

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
- **Semantic Scholar and arXiv need a CORS proxy.** `proxy/worker.js` is a 30-line Cloudflare
  Worker that unlocks both (and can hold your S2 key server-side). Without it the app tells you
  so instead of failing silently.
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



## Evaluation: what is actually measured, and how well

`tests/eval-ranking.mjs` implements the conventions the IR literature uses: **depth-k pooling**
(judge the union of the top-8 from every ranking variant compared), **graded relevance 0-3**,
**nDCG@8** as the primary metric with P@5/P@8 alongside, and a **train/test split of queries**
so weights are chosen on one half and reported on the other. Queries and rubric live in
`tests/queries.json`; raw judgments are written to JSON so they can be inspected or overridden.

First run, 12 queries, 196 pooled judgments:

| variant | TRAIN nDCG@8 | **TEST nDCG@8** |
|---|---|---|
| legacy (abstract-only + citation nudge) | 0.714 | **0.832** |
| current (lexical + citations + readability) | 0.952 | **0.966** |
| v1 (consensus + recency — the variant dropped) | 0.941 | **0.977** |

Read honestly:

- **The ranking rewrite is validated**: +0.13 nDCG@8 on held-out queries over the old ranking.
- **The rejected consensus variant is not topically worse** — it scores ~equal-to-better here.
  It was dropped for a different reason: it promoted records with **no full-text link**
  (availability 8/8 → 1/8 in the earlier measurement), which is fatal for a tool that has to
  quote what it cites. Two metrics disagreeing is the useful part; the reason for dropping it
  is availability, not topicality.
- **The judge cannot discriminate.** Grades came out 73% `3`, 25% `2`, 1% `0` — 98% of pooled
  documents counted as relevant, so P@8 is 1.000 for every variant and nDCG is squeezed into
  0.83–0.98. The rubric's core-term lists are too broad. The harness prints a warning when this
  happens rather than letting the numbers look meaningful.
- **12 queries is under-powered.** The literature puts a stable system ranking at ~83 queries
  (MTC) or 30-60 judgments/query across ~100 queries. Treat everything above as directional.

The honest next step is therefore **not** more weight tuning — it is a stricter judge: adjudicate
the 196 pooled documents properly (human, or a model told to grade strictly), which turns this
into an evaluation that can actually separate close variants.



- **No live-browser render check yet** — the app's logic is verified headlessly (**87/87** assertions) and
  against real APIs, but the visual layout hasn't been smoke-tested in a browser from here.
- Semantic Scholar + arXiv need the worker deployed.
- Library is `localStorage` (~5 MB) — full-text PDFs will fill it; move to IndexedDB for volume.
- No PDF annotation layer, no document writer, no Google mode.
- Single-user, no sync.

## Known gaps (honest list)

- **The ranking judge is a rubric, not a human.** 98% of pooled documents grade as relevant, so
  the eval cannot separate close variants. See Evaluation above.
- **The browser pass covers one smoke flow and three viewport sizes** — no keyboard-only
  navigation, focus-order or screen-reader audit yet.
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
2. Keyboard flow, focus states and a screen-reader pass on the browser test.
3. IndexedDB library with per-paper embeddings for large corpora.
4. `citeproc-js` + CSL styles for real 10,000-style bibliographies.
5. A stricter judge for the pooled documents (~196 now) — human or model adjudication — plus
   growing the query set toward the ~80 the literature says is needed for a stable ranking.
6. Brave/Serper "web mode" adapter (same interface as the other sources).
