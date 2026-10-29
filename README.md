# CiteKit

A self-contained academic research workspace that runs entirely in the browser: **nine scholarly
databases, a Tavily-backed web source, deterministic ranking, and citation-grounded answers through
your own model key**. No backend, no build step, no account — one HTML file. Search ~300M works,
add general web pages when you need them, ingest your own PDFs, and every claim comes back with a
numbered citation you can click through.

```bash
git clone https://github.com/watanabefam/citekit.git && cd citekit
python3 -m http.server 8777        # or just double-click index.html
open http://127.0.0.1:8777/index.html
```
(An `http://` origin is needed rather than `file://` if you use the optional proxy —
browsers send no `Origin` header to `file://`, which some APIs require.)

Then: **Settings** → pick provider → paste key → search → tick papers → *Add +* → ask questions.
Tick **dry run** first if you want to see the exact prompt before spending tokens.

`node tests/verify.mjs` runs 95 behavioural assertions against live APIs and fake SSE providers.
`tests/browser.mjs` (44 assertions) drives real Chromium; `tests/proxy-integration.mjs` (16) verifies
the optional Cloudflare Worker against the real workerd runtime; `tests/mcp-server.mjs` (19) speaks
the MCP protocol over stdio to the real server. `tests/tools-search.mjs` (11) covers the CLI, and
`tests/fidelity.mjs` (55, plus 3 live probes) covers the citation-integrity checks.

---

## Design: what each part runs on

Commercial AI research assistants are thin orchestration layers over free bibliographic APIs plus a
model you already pay for. This is that teardown, part by part.

| Capability | What the commercial tools run on | What CiteKit uses |
|---|---|---|
| **Semantic literature search** ("200M+ peer-reviewed papers") | Semantic Scholar Graph API | **OpenAlex** (primary, CORS-open) + Crossref, Europe PMC, PubMed, **ERIC**, **DOAJ**, **CORE**, Semantic Scholar, arXiv |
| **Web search mode** | a search API | **Tavily** — keyless by default, optional free key; web pages render in a separate *not peer-reviewed* section and never enter the scholarly ranking |
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
| `api.tavily.com/search` | optional | ✅ browser-origin request returned **HTTP 200** in Chromium (2026-10-20) | keyless is rate-limited; free key = **1,000 credits/month** |
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

Four tools:

| Tool | What it does |
|---|---|
| `search_literature` | Nine sources at once, deduped, deterministically ranked |
| `search_web` | Tavily web pages with title, URL, host, retrieval date and extracted text; optional domain and recency filters |
| `expand_citations` | One level of citation-graph walking, both directions, provenance-tagged |
| `get_record` | Resolve a DOI to a full metadata record |

A client needs the command and the environment, nothing else:

```json
{ "mcpServers": { "citekit": {
  "command": "node",
  "args": ["/absolute/path/to/citekit/tools/mcp-server.mjs"],
  "env": { "CITEKIT_OPENALEX_KEY": "…", "TAVILY_API_KEY": "…" }
} } }
```

Put keys in `env` rather than on a command line — process arguments are readable by every
user on the machine. Five of the nine scholarly sources need neither a key nor a budget, and
`search_web` works keyless with a rate limit; `TAVILY_API_KEY` (or `CITEKIT_TAVILY_KEY`) raises
it. A client that rewrites its MCP entry (OpenCode does) can use a `0600` key file instead:
the server reads `~/.config/citekit/tavily.key`, or `CITEKIT_TAVILY_KEY_FILE=/path`. Environment
wins over the file. Requires Node 18+ (global `fetch`).

`tests/mcp-server.mjs` (19 assertions) spawns the server and speaks the real protocol rather
than assuming it: lifecycle and version agreement, capability declaration, tool schemas, the
`-32602`/`-32601` error paths, the rule that a notification is never answered, four live tool
calls, and stdio shutdown.

## Web search (Tavily)

The Web source is **on by default** in Discover. It is a separate lane, not a tenth scholarly
source:

- **No key required.** The browser calls `api.tavily.com/search` directly with
  `X-Tavily-Access-Mode: keyless`. A free key in Settings raises the limit; the key stays in
  `localStorage` and is sent only to Tavily.
- **Browser-callable, re-verified.** On 2026-10-20 a real Chromium page received HTTP 200 from
  the keyless endpoint with CORS headers. The same browser pass rendered **63 papers + 8 web
  pages** for the structured-literacy query.
- **Separate ranking.** Web pages are ordered by Tavily relevance, then lexical overlap. They
  do not enter the paper score, and a web page is never merged with a paper by title.
- **Labelled honestly.** Cards and prompt blocks say *web page (not peer-reviewed)*. The prompt
  treats page text as untrusted data and tells the model to ignore instructions inside it.
- **Capped text.** Each web result stores at most 6,000 characters; the answer context takes at
  most half its slots from web, so default-on web cannot crowd out papers.
- **Same implementation everywhere.** MCP `search_web`, `node tools/search.mjs --sources web`,
  and the browser all drive the shipping adapter through `tools/load-ll.mjs`.

Median added latency for the web lane has **not** been measured yet; the tests prove the path
works, not that it is fast. Jina Search and self-hosted SearXNG remain parked as fallbacks.

## Architecture

```
index.html ──┬─ adapters ──► OpenAlex / Crossref / Europe PMC / PubMed / ERIC / DOAJ / CORE (direct fetch, CORS)
             │                Semantic Scholar / arXiv                   (via proxy/worker.js)
             ├─ web ────────► Tavily search (keyless or BYOK, browser-direct)
             ├─ dedupe ─────► DOI → title-normalised merge; web deduped by canonical URL, kept separate
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
node tools/search.mjs "Tavily Search API" --sources web --per 3
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
`--out FILE` · `--no-enrich` (skip the metered OpenAlex pass) · `--queries FILE` · `--list-sources` ·
`--tavily-key K` · `--web-domains csv` · `--web-time day|week|month|year`.
Default sources are the keyless/CORS-open set; `s2`, `arxiv` (need the proxy), `core` (needs a key)
and `web` (Tavily, keyless by default) are opt-in. `node tests/tools-search.mjs` smoke-tests it.

**Should there be more sources?** Mostly no — see [`docs/source-coverage.md`](docs/source-coverage.md)
for the probe-by-probe answer: ten endpoints tested, the ones that are bot-walled or paid and why,
the additions worth making across disciplines, the ones that refuse access, and how the ranking eval constrains what can be added.

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

## Citation integrity — `tools/fidelity.mjs`

Retrieval can be excellent and the claims built on it still wrong. That happened: a document
assembled from these searches carried **six** defects, and every search, ranking and citation
number involved was correct. Two published base rates say that is the normal case, not a careless
one:

| Base rate | Source |
|---|---|
| **11.9%** of quotations contain a *major* error [95% CI 8.4–…], 28 studies | Jergas & Baethge (2015), *PeerJ* |
| **26.01%** of assertions unsupported; **34.77%** of articles carry at least one | Martella et al. (2021), *Review of Educational Research* 91(2):272–308 — 1,630 assertions in 1,090 articles citing Freeman et al. (2014) |
| ~20–25% of cited "facts" inaccurate | recount in *PLOS ONE* (2017) of prior reviews |

Martella et al. also name the commonest single failure, and it is not fabrication: **specification**
— citing an aggregate effect to support a narrower claim the synthesis never tested (16.93% of
assertions). "Active learning beats lecture" cannot be cited as "cooperative learning beats lecture."

```bash
node tools/fidelity.mjs doi 10.1378/chest.128.6.3817        # retraction + scope for one work
node tools/fidelity.mjs screen DOI [DOI...]                # batched, one metered call
node tools/fidelity.mjs draft ../family/habits/prayer.md   # audit prose
node tools/fidelity.mjs draft FILE --strict                # exit 1 on an undeclared relay
node tools/fidelity.mjs quotes FILE.md --online            # verify quotations against live sources
node tools/fidelity.mjs refs FILE.md                       # orphan citations, uncited references
node tools/fidelity.mjs sources                            # cached sources + their token cost
node tools/fidelity.mjs passage URL --grep "phrase"        # one passage, not the whole paper
node tests/fidelity.mjs [--live]                           # 176 assertions, 3 live probes
```

**Four checks over already-fetched payloads, plus two that read the draft's sources.** The suite
still needs no network except the three `--live` probes: the online path is tested against a mocked
fetch.

1. **Retraction** — `classifyRetraction({crossref, openalex})`. Three signals, because no single one
   is sufficient (see the probe table below). Runs on **every `tools/search.mjs` run** by default:
   one batched OpenAlex call screens every DOI across every query, and flags hits inline with
   `⚠ RETRACTED`. `--no-screen` skips it.
2. **Attribution** — `detectAttributions(abstract)`. Does this abstract report *other people's*
   findings? Handles the scholarly form ("Bengtson et al. 2013") **and** the institutional form
   ("the Pew Research Center found"), which has no year and was how four of the six defects entered.
3. **Claim scope** — `claimScope(record)` → `primary?` / `mixed?` / `secondary?` / `secondary`. OpenAlex
   `type` does distinguish `review` from `article`, so this is metadata, not a guess. `mixed?` exists
   because a paper can have sound own-data *and* unreliable summaries of others — flattening that to
   "secondary" would overstate the case against it.
4. **Draft audit** — `auditSentence` / `auditDraft`. Three levels, deliberately separated by precision:

| Level | Signal | Fails a build? |
|---|---|---|
| **HARD** | relay marker — "as reported by", "quoted in", "summarised in", "according to \<named source\>" | Yes, under `--strict` |
| **WARN** | two or more *separate* parenthetical citation groups (the "X says Y found Z" shape). One parenthetical with a semicolon list is a citation list, not a relay | No |
| **ADVISORY** | a cited figure; a synthesis narrowed to a specific cause; declared provenance | No |

And a **claim ledger** for the class the audit cannot reach — claims that are second-hand *quietly*:

```bash
node tools/fidelity.mjs claim add --text "median 66 days to asymptote" \
     --author-year "Lally 2010" --access abstract --ledger doc.claims.jsonl
node tools/fidelity.mjs claim check --ledger doc.claims.jsonl --draft doc.md
node tools/fidelity.mjs cite 10.3102/0034654321991228     # how others actually cite it
```

| Access | Means |
|---|---|
| `full-text` | the work's own body was read |
| `abstract` | only the abstract |
| `via-secondary` | never opened; read a summary of it inside another work (`--via "Dollahite 2019"`) |
| `not-read` | cited anyway — **the default, so forgetting fails closed** |

`claim check` fails on five things: `not-read`; a claim carrying a **figure** at anything below
full text (the "median 66 days" class — the figure was in the body, the abstract was read); a
**load-bearing** claim seen only `via-secondary` (the Dollahite class); `via-secondary` with no
secondary named; and, as a WARN, a `supports` verdict recorded on an abstract.

**Corroboration is counted in evidence lines, not citations** — from SEPIO, whose model makes an
assertion's identity depend on proposition, agent and occasion, and whose evidence model is built
around distinct lines of inquiry. Two claims drawn from one paper are **one** line. The stats line
prints that ratio, and it is the number that exposed the real error in the document this came from:
six claims, six citations, **one** read at full text.

Citations present in the draft but absent from the ledger are reported as a **completeness backlog,
not failures** — 52 of them on a real draft, which as "errors" would make the gate useless. Only
`--strict-incomplete` fails on those.

**What the ledger cannot do.** It records a verdict; it never predicts one. SciFact/SCIVER (Wadden
et al., EMNLP 2020) is the reference task for claim verification, and its leaderboard tops out near
**46% F1** — a coin-flip for three-way SUPPORTS/REFUTES/NOT_ENOUGH-INFO. An automated verdict here
would be worse than no tool, because it would be believed. It also only helps if it is filled in:
it is a discipline aid, not a detector.

### Keeping the ledger cheap

A ledger that costs context on every read will not be maintained. Measured with `o200k_base` on a
realistic 100-claim ledger:

| View | tokens | vs verbose |
|---|---|---|
| verbose JSONL (the original format) | 13,474 | — |
| compact JSON | 6,015 | **−55%** |
| pipe-positional | 4,645 | −66% |
| markdown table | 5,313 | −61% |
| **the report alone** | **125** | **−99%** |

The lesson is that the encoding is the small lever and the interface is the large one. So:
**compact JSON is the store** (short keys, one-character enums, defaults omitted — no delimiter
escaping to get wrong, and still extensible), and markdown is a **generated view** for a human or a
prompt. Legacy verbose records still read, so an existing ledger keeps working.

The real rule is the last row: an agent should read `claim check`, which prints findings and counts,
and never `cat` the ledger. That is a 99% saving for the same information.

### Reconciliation — the gap that used to fail silently

A ledger entry is keyed on its claim text, so **editing the claim in the draft orphaned the entry**
and it stopped applying without saying so. Matching is now on similarity, not identity, and all
three outcomes are reported:

```bash
node tools/fidelity.mjs claim check --ledger doc.claims.jsonl --draft doc.md
#   reconciliation against 436 draft claim(s):
#     3 matched · 1 drifted · 2 stale · 433 draft claims unledgered
```

| Outcome | Meaning | What to do |
|---|---|---|
| **matched** | the claim is in the draft, essentially unchanged | nothing |
| **drifted** | similar but the wording moved | re-record it, or confirm the access level still holds |
| **stale** | no longer in the draft at all | delete it, or find where it went |

Similarity is `0.5 × Jaccard + 0.5 × containment × lengthRatio`. The length ratio is not decoration:
plain containment scored **1.0** between a six-word claim and a long unrelated sentence that
happened to contain all six words, which produced confident false matches. `claim add` runs the same
test and refuses to append a near-duplicate unless you pass `--replace`.

`--strict-stale` fails the build on stale entries; without it they are reported only.

### Quote verification

Deterministic, no model. Two independent implementations (`pagecite`, `citefact`) treat this as
solved, and a production measurement (wyper.io, n=513 readable pages) puts the base rate at
**6.43% of cited quotes not on the page** (upper 95% bound 8.56%) — one in fifteen.

```bash
node tools/fidelity.mjs quotes doc.md --corpus sources/
```

Normalisation follows `pagecite`, because each rule is a named failure mode: case/punctuation/
whitespace ignored, ligatures folded (`ﬁ`→`fi`), line-broken words rejoined (`con-\nstraint`),
thousands separators normalised — and **decimal points preserved, so `4.2` can never match `42`**.
An ellipsis splits the quote into parts that must appear *in order*. Under four words is refused
rather than credited.

Extraction scans a **block**, not a line, and reads blockquotes. Markdown prose is hard-wrapped, so a
quotation routinely breaks across a newline; a line-by-line scan returns nothing for those, and a
miss is indistinguishable from an absence. On the real document that bug hid a third of the
quotations, including the one the whole file is built on. Context is taken from the sentence carrying
the quote rather than the whole block, so proximity to a citation still separates a quotation from a
scare quote.

A quote is only checked when a **citation sits in the same sentence**. That gate is what separates a
quotation from a scare quote, a rhetorical question, or the words of a prayer. Without it, the real
draft produced 34 "not found" flags of which most were the author's own emphasis; with it, 6 — and
of those, 4 were quotes from a source that simply was not in the corpus yet.

#### Checking against the sources themselves, online

A local corpus is the fast path, not the only one. `--online` resolves each quote's citation to a
live copy:

```bash
node tools/fidelity.mjs quotes doc.md --online                      # DOI -> open-access copy
node tools/fidelity.mjs quotes doc.md --online --map sources.json   # explicit label -> URL
```

Probed with a plain request and a browser User-Agent: **arXiv 200, PMC 200, vatican.va 200,
pewresearch.org 200, scborromeo.org 200, MDPI 403 "Access Denied"**. So preprints, PMC, and
institutional web pages are checkable; some publishers block automated fetches, and closed-access
work is unavailable by definition.

Three things this had to get right, each found by running it on real DOIs:

**Two OpenAlex limits were being violated, and one of them was silent.** OpenAlex caps `|` (OR) at
**100 values per filter** and `per_page` at **100**. The screen joined every DOI into one URL and
paged at 50, so: more than 100 DOIs failed the whole request, and **more than 50 DOIs came back
truncated — the extra DOIs carried no retraction flag and looked clean.** A screen that quietly
covers half its input is worse than no screen, so DOIs are now chunked at the OR limit with
`per_page` set to match, and duplicates collapse first.

**What OpenAlex actually costs, measured rather than assumed** (`meta.cost_usd` on live calls):

| call | cost |
|---|---|
| single entity by DOI (`/works/doi:…`) | **free** — no cost field at all |
| list + filter (`?filter=doi:a|b|…`), 1 or 100 DOIs | $0.0001 |
| full-text **search** (`?search=…`) | $0.001 — 10× a list call |

So batching does not save money on lookups — they are already free. It saves *requests* (10/s
keyless), which is why the screen batches and the resolver does not need to. The real budget driver
is **search**, at a cent per thousand.

**Keyless means $0.10/day shared across everything on your network's IP.** OpenAlex states this in
its own `200` response, along with the correction to a widely repeated belief: *"the mailto parameter
doesn't raise this limit."* A free key (`openalex.org/settings/api`) gives **$1/day, per account**,
and raises the per-second limit from 10 to 30. Set it once:

```bash
export CITEKIT_OPENALEX_KEY=...        # or OPENALEX_API_KEY; reuses the app's own setting name
```

A 429 now says which of those it is and what to do, rather than surfacing `HTTP 429`. Every response
also carries `x-ratelimit-remaining-usd`, so the tool reads your live balance and warns before it
runs out instead of after:

```
OpenAlex budget low: $0.0071 of $0.10 left (7%). Set CITEKIT_OPENALEX_KEY for $1/day
instead of the shared $0.10.
```

Put the key in a file rather than in shell history — the same convention as `tavily.key`:

```bash
mkdir -p ~/.config/citekit && chmod 700 ~/.config/citekit
printf '%s' 'YOUR_KEY' > ~/.config/citekit/openalex.key && chmod 600 ~/.config/citekit/openalex.key
```

`CITEKIT_OPENALEX_KEY` / `OPENALEX_API_KEY` take precedence if set. `search.mjs` reads the same
variable and also accepts `--openalex-key`.

#### Caching search results without hiding new papers

A search cache is where honesty gets hard: a stale result set is indistinguishable from a current
one unless you say so. Three things this had to establish first, by probing rather than assuming:

| question | answer |
|---|---|
| Does OpenAlex support `ETag` / `If-None-Match`? | **No** — no `ETag`, no `Last-Modified`, no `Cache-Control`. Revalidation is always a full, charged search |
| Is `from_created_date` (index-changed-since) available? | **No** — "part of daily sync, which comes with the Member+ and Partner plans" |
| Is `from_publication_date` available free? | **Yes** — an ordinary filter |

So on the free tier there is no cheap revalidation and no true delta sync. Cached results are
labelled instead:

```bash
node tools/search.mjs "structured literacy" --sources openalex      # reuse up to 6h
node tools/search.mjs "structured literacy" --max-age 1             # fresher
node tools/search.mjs "structured literacy" --fresh                 # bypass entirely
```

The age appears in the output, always — `_12 unique · cached 3h ago_` — so a stale set can never be
mistaken for a fresh one. What is cached is **discovery only**: titles, years, DOIs, abstracts. The
**retraction screen always re-runs**, because a paper's standing can change while its metadata
cannot. That is the one stale value that could actually hurt someone, so it is never stored:

```
_cache: 1 hit · 0 miss · max age 6h — discovery is cached, retraction status is always re-checked
```

**Timestamp and cooldown is the right shape but not the whole answer**, because a TTL only bounds
how old an answer may be — it never tells you *what you missed*. The real fix is a refresh that is
additive. On the free tier the closest available is `from_publication_date`, which costs one
list-filter call:

```
https://api.openalex.org/works?filter=from_publication_date:2026-10-01,default.search:structured+literacy
```

Its blind spot is worth stating: it finds works *published* since a date, not works *added to the
index* since one. A paper loaded into OpenAlex late, with an old publication date, will not appear —
and only the Member+ `from_created_date` filter can catch that. For anything load-bearing, `--fresh`
is the correct flag.

**`best_oa_location` is not authoritative.** For `10.48550/arXiv.1706.03762` (Attention Is All You
Need) OpenAlex returns the correct title but a `best_oa_location` pointing at an unrelated preprint
host. Trusting it fetched a tumour-biology paper. All OA locations are now collected and tried in
order — including repository mirrors, which are often reachable when the publisher is not.

**Every candidate must pass a title gate** before any verdict is drawn from it. Without that, a
wrong-but-fetchable URL produces a confident "quote not found" against an innocent author. The gate
is what makes the difference between rejecting a *copy* and rejecting a *quote*: on the arXiv DOI,
candidate 1 fetched 97KB of the wrong document and was discarded, and candidate 5 verified.

**"Could not check" is its own outcome.** A blocked fetch, a closed-access work, a title mismatch,
or a page that does not contain the cited paragraph all report `unverifiable` with the reason —
never `not found`. The same applies to a `§N` citation whose fetched page does not contain `§N`
(the equivalent of pagecite's `quote_page_mismatch`): the map pointed at the wrong page, so the
quote is not accused.

Verified end to end: a verbatim sentence from the arXiv PDF verified from the fetched source, and a
one-word mutation of the same sentence did not.

Worked example on the real draft (`family/habits/prayer.md`, 1,100 lines):

```
102 inline quote(s) · 7 verified · 0 not found · 16 unverifiable · 44 unattributed · 35 too short
  VERIFIED   [map · CCC 2688] The memorization of basic prayers offers an essential support to the life of prayer…
  VERIFIED   [map · CCC 2729] The habitual difficulty in prayer is **distraction**.
  VERIFIED   [map · Pew 2009] just gradually drifted away
  SKIPPED    [Pew 2009; Bengtson 2013] Bengtson 2013: no URL — add it to --map
```

Zero false accusations, seven real verifications, every skip explained. The counts moved from 69
quotes / 5 verified to 102 / 7 when quotation extraction was fixed to scan blocks instead of lines —
the earlier figure was an undercount, not a different document.

A `--map` file is plain JSON. Values may be a URL, a list of URLs, or `{url, title}`; a key of `CCC`
covers every `CCC <n>`, and a key of `§` covers bare section references:

```json
{
  "CCC": "https://www.scborromeo.org/ccc/p4s1c3a2.htm",
  "§": "https://example.org/directory-of-catechesis",
  "Pew 2016": "https://www.pewresearch.org/religion/2016/08/24/why-americas-nones-left-religion-behind/"
}
```

An explicit map is required for books, catechism paragraphs and reports because guessing a URL from
"Pew 2016" would sometimes resolve to the wrong document, and a wrong document is worse than no
check. Fetched sources are cached under `~/.cache/citekit/src/`, so a second run costs nothing.

**Commit the map beside the document.** If `citations.map.json` sits in the same directory as the
draft, `quotes` finds it with no flag at all:

```
$ cd family/habits && node ../../citekit/tools/fidelity.mjs quotes prayer.md --online
69 inline quote(s) · 5 verified · 0 not found · 1 unverifiable · 28 unattributed · 35 too short
sources: 0 corpus file(s) + online resolution + map citations.map.json
  VERIFIED   [map · §154]   after a process of explanation
  VERIFIED   [map · CCC 2729] The habitual difficulty in prayer is **distraction**.
```

Keeping it in the repository rather than in a home directory is the point: it is the only input that
cannot be derived, so it has to be reviewable in a diff and usable by any agent or collaborator who
picks the document up later. Two label rules make a small map cover a lot:

- the source word **nearest** a § wins, so `DGC §154 … and the CCC agrees` resolves as DGC
- a bare `§2727` resolves to a filed `"CCC 2727"` entry, so the document can be inconsistent about
  spelling without losing coverage

#### Reading a source without paying for it

Fetching a source for a check does not mean putting it in front of a model. Measured on one real
paper:

| artefact | size | tokens |
|---|---|---|
| the raw PDF | 4.74 MB (6.3 MB as base64) | unusable — beyond any context window |
| extracted text | 97,246 chars | 17,704 |
| one quoted sentence | 236 chars | 47 |
| a verdict line | 29 chars | 21 |

So conversion is not a token cost at all — `pdftotext` runs locally and the comparison is string
matching, so checking a 4.7 MB PDF costs nothing. The cost only appears when text goes into a
prompt. Two commands keep it out:

```bash
node tools/fidelity.mjs sources                                  # what is already cached
node tools/fidelity.mjs passage scborromeo --grep "habitual difficulty"
#   2729 The habitual difficulty in prayer is distraction. …      1 passage, ~165 tokens
#   The whole source would have been ~2,979 tokens.
```

`sources` lists every fetched source with its size, and `passage` returns only the matching lines
plus context, with both token counts printed. The cache is addressed by URL through
`~/.cache/citekit/src/index.json`, because a directory of sha1 filenames is not queryable and
"read only the passage you need" otherwise degrades to "cat the whole paper".

Checking 100 papers costs ~2,100 tokens of verdicts. Loading those 100 papers costs ~1.77M.

### Citation / reference symmetry

The two cheapest findings, both needing no source text at all:

```bash
node tools/fidelity.mjs refs doc.md
#   39 reference entries · 42 in-text citations
#   2 orphan citation(s) — cited but not in Sources
#   1 uncited reference(s) — in Sources but never cited
```

An `orphan citation` is the fabricated-citation signal: prose cites a work the bibliography does not
contain. Getting this to useful precision took four fixes, each found by running it on a real
document and reading the output rather than the code — semicolon-separated bullets carry several
citations; tier labels (`**Research**, Dollahite 2019`) are not authors; institutions are matched by
full phrase, not by their last word; and a reissue year (`Routledge (reissued 2022)`) is not a second
citation year. On the real draft those four took it from 23 orphans and 23 uncited to **2 and 1** —
and both orphans were genuine.

**Declared provenance downgrades rather than silences.** A sentence saying "second-hand",
"abstract only", "not read" or "reported-not-verified" moves from HARD to ADVISORY: it is still
second-hand, but no longer *undeclared*. Without that, the tool penalises honesty — the audited
document's frank "second-hand citation (Hansen 1998, via Dollahite)" would fail `--strict`, which
pushes an author to delete the disclosure rather than the error. The distinction it enforces is
**status word, not route word**: "quoted in" says where a claim came from, which is not the same as
saying how far it was verified.

### Probed, not assumed (2026-10-29)

| Probe | Result | Consequence for the code |
|---|---|---|
| Chest 2005 (`10.1378/chest.128.6.3817`), retracted 2008 | Crossref returns **no** `update-to`, no `updated-by`, no `relation`. Only the title prefix `RETRACTED:`. OpenAlex `is_retracted: true` | A Crossref-only check **misses** it. Title-prefix detection is load-bearing, and there is a regression test asserting Crossref alone still catches it |
| Wakefield notice (`10.1016/S0140-6736(10)60175-4`) | Crossref `update-to: [{type:'retraction', source:'retraction-watch'}]`; OpenAlex `type: 'retraction'` **and** `is_retracted: true` | `update-to` lives on the **notice**, not the work. And `is_retracted` is **ambiguous**: on a notice it means "this is a notice". Type disambiguates; without that branch the tool reports a retraction notice as a retracted work |
| OpenAlex batch `filter=doi:a\|b\|c&select=doi,type,is_retracted` | 3 DOIs, one call, `cost_usd: 0.0001` | Screen a 20-result search in **one** metered call, then fetch Crossref detail only for hits |
| OpenAlex `type` on a known review | `review` (vs `article`) | Claim scope is read from metadata rather than inferred from the title |
| Semantic Scholar `/paper/DOI:…/citations?fields=contexts` | Works keyless, returns the verbatim citing sentences — but the anonymous pool 429s within a few calls | `cite` is best-effort; the error names `CITEKIT_S2_KEY` rather than surfacing a bare 429 |

### What it cannot do

- **It cannot tell you a claim is wrong.** It tells you which sentences must be opened at primary
  source before the claim is load-bearing. On the six real defects it satisfies: **HARD 2/6, any
  level 6/6** — asserted in the suite, so a change that quietly improves or degrades recall fails
  the test rather than passing unnoticed.
- **The confidence class needs the ledger, and the ledger needs you.** `claim check` catches
  "median 66 days" and an unverified effect size *if they are entered with an honest access level*.
  Nothing forces that; it is a discipline aid, not a detector. A ledger left empty passes silently.
- **Verdicts are recorded, never predicted.** See the SciFact note above: ~46% F1 makes an automatic
  SUPPORTS/REFUTES/NOT_ENOUGH_INFO worse than useless.
- **Abstracts are not papers.** Dollahite et al.'s abstract attributes to one source (Pew); its
  *body* also summarised Bengtson, Lee, Hansen and Vermeer. Abstract-level detection cannot reach
  the body, which is where half the errors lived.
- **Absence of a retraction flag is not safety.** The verdict is `no-retraction-on-record` with a
  timestamp and a caveat, never "clean" — coverage depends on the publisher and on Retraction Watch's
  feed into Crossref.
- **No grammar for scope.** "Active learning beats lecture" → "cooperative learning beats lecture" is
  caught only when a specifier word is present. The semantic version needs the synthesis's own
  claim list, which CiteKit does not hold.

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
- **Web search is Tavily-only.** No Google, Bing, Brave, or Serper adapter yet; keyless Tavily is
  rate-limited, and the free key is the escape hatch. Jina Search and self-hosted SearXNG are
  parked, not implemented. The web lane's median latency is unmeasured.
- No PDF annotation layer, no document writer.
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
1b. ~~An access-level ledger for the confidence class~~ — **built** as `claim add|list|check`, with
   reconciliation, compact storage, quote/symmetry checks and online source resolution alongside.
   Still missing: a pre-commit hook; automatic author-year -> DOI resolution, which is left to the
   explicit `--map` because a mis-resolved work is worse than an unperformed check; and page-level
   checking, which needs the source's page mapping and is why `pagecite` reports
   `quote_page_mismatch` separately. Block-quote scanning was first deferred as noise and then turned
   out to be essential: the house style puts its most important quotations in `> ` blocks, so
   scanning blocks (and taking the context from the sentence rather than the paragraph) was required
   to reach the real quotations at all.
2. A real screen-reader pass (VoiceOver/NVDA). The automated assertions cover roles, live regions,
   focus order and keyboard operability, but no screen reader has actually been driven.
3. IndexedDB library with per-paper embeddings for large corpora.
4. `citeproc-js` + CSL styles for real 10,000-style bibliographies.
5. Deeper pooling (k=20 rather than 8) and grow the query set toward the ~80 the literature says
   a stable system ranking needs. The judge is no longer the bottleneck: even after hand
   adjudication 92% of pooled documents grade >=2, because a depth-8 pool barely contains
   non-relevant documents at all. Also worth running `--judge-model` once to compare a model's
   verdicts against the hand grades — the machinery is built and has never been exercised.
6. Measure the web lane's median added latency, then add Jina Search or self-hosted SearXNG as a
   fallback before considering Brave/Serper. Tavily is the only implemented web provider.
