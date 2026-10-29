# Source coverage across disciplines — what to add, what refuses

Researched 2026-10-29 across five probe rounds against ~30 endpoints. Every verdict below comes from
a request actually made during that session, with the response code recorded. Where a probe was
inconclusive it says **unresolved** rather than guessing. Written for coverage useful beyond one
person's field.

## The three questions a new source must pass

Adding a source is not free: it adds a maintenance surface, a parsing path, a failure mode, and
weight inside ranking. A candidate earns its place only if it answers **yes** to at least one of
these and is not blocked on the rest:

1. **Does it carry records OpenAlex lacks?** OpenAlex indexes ~300M works; most indexes read
   overlapping corpora, so a second bibliographic source is often a duplicate feed with a new API
   shape.
2. **Does it carry a signal, not just records?** Retraction status, post-publication critique,
   evidence-quality ratings, dataset identity — information that is not a citation record at all.
   This is where the real gaps are.
3. **Is it reachable?** Keyless preferred. **CORS matters**, because the browser app (`index.html`)
   can only call CORS-open endpoints while the CLI can call anything.

## Current coverage

Ten sources, six by default: `openalex`, `crossref`, `epmc`, `pubmed`, `eric`, `doaj`; opt-in `s2`,
`arxiv`, `core`; plus `web` (Tavily). `node tools/search.mjs --list-sources` prints the live list.

## Works — verified reachable

| source | field | probe evidence | CORS | note |
|---|---|---|---|---|
| **zbMATH Open** | mathematics | `api.zbmath.org/v1/document/_search` → **200, 18 KB** | no | keyless; the discipline's canonical index |
| **CiNii Research** | Japan, all fields | `cir.nii.ac.jp/opensearch/all` → **200 JSON** | **yes** | Japanese-language scholarship, browser-usable |
| **OpenAIRE Graph** | EU research, all fields | `api.openaire.eu/graph/v1/researchProducts` → **200, numFound 21,509** | **yes** | cursor paging; there is **no `limit` parameter** |
| **DataCite** | datasets, software, samples | `api.datacite.org/dois?query=…` → **200 JSON** | **yes** | the "cited object is a dataset" case |
| **Figshare** | research outputs | `api.figshare.com/v2/articles` → **200** | **yes** | |
| **bioRxiv API** | life-science preprints | `api.biorxiv.org/details/biorxiv/…` → **200** | **yes** | |
| **medRxiv API** | clinical preprints | `api.medrxiv.org/details/medrxiv/…` → **200** | **yes** | |
| **SciELO articlemeta** | Latin America, all fields | `articlemeta.scielo.org/api/v1/article/` → **200, 397 KB** | no | large non-English corpus, **CLI only** |
| **Crossref `filter=updates:<DOI>`** | retraction cross-check | → **200** | n/a | see caveat below |
| **PubPeer v3** | post-publication critique | `POST pubpeer.com/v3/publications?devkey=PubPeerZotero` → **200** | n/a | the only critic signal available |

### Two of these have demonstrated value

**PubPeer reports something nothing else does.** Batching three DOIs in one call returned:

```
HTTP 200 — 2 of 3
  10.1038/s41419-019-1320-z        17 comments
  10.1080/15548627.2015.1100356    35 comments
```

Both are **not retracted**, so they pass the current screen as clean. That is the gap, demonstrated
rather than asserted. The devkey is the one Zotero and the `metacheck` package use; PubPeer's FAQ
says a general API is forthcoming, so pin the devkey and treat it as best-effort.

**Crossref `updates:` looks like a retraction oracle and isn't quite one.** It works —
`filter=updates:10.1177/1758835919874651` → `total: 1` — but it returns **`total: 0`** for
`10.1378/chest.128.6.3817`, the Chest 2005 retraction this repo already uses as its control case.
So Crossref's coverage is genuinely incomplete, OpenAlex's `is_retracted` remains necessary, and
`updates:` is a cross-check and a fallback when OpenAlex 429s. `filter=update-type:retraction`
enumerates **76,515** notices — the right shape for bulk screening, not for "is this DOI retracted".

## Works — reachable only with a free token

| source | field | probe | note |
|---|---|---|---|
| **NASA ADS** | astronomy, physics, earth science | **401** | free token; the authoritative index for astrophysics — no other source comes close |
| **CourtListener** | US case law | **401** | free token; primary legal sources, a domain CiteKit has none of |
| **PatentsView** | US patents | no response | API key now required |

These fit the existing opt-in pattern (like `s2` and `core`): present, documented, off by default.

## Books

| source | probe evidence | what it gives |
|---|---|---|
| **Open Library** | `openlibrary.org/search.json` → **200, numFound 2** with title / author / year / ISBN — then became unreachable (`Failed to connect … after 169 ms`, three retries) | book *existence* and citation correctness, **not** quotation correctness |
| **Google Books** | `429`, *quota exceeded on the shared anonymous project* | needs your own GCP key; returns snippets, not verifiable text |
| **HathiTrust** | `403` Cloudflare | full view is public-domain only |
| **Internet Archive full-text API** | `ia-fts.archive.org` has **no DNS record** | the documented host does not resolve |
| **Open Library "search inside"** | `200` but JavaScript-rendered; browser backend unavailable this session | **unverified** — would need Playwright |

## Bot-walled, broken, or unresolved

Recorded so nobody re-investigates.

| source | probe result | verdict |
|---|---|---|
| **DBLP** (computer science) | `202` + *"Making sure you're not a bot!"* (Anubis challenge), unchanged after a 10 s wait | excellent index, not scriptable today |
| **IxTheo** (theology, 4.5M entries), **RelBib** | `200`, but body is *"Verifying your browser"* proof-of-work | not scriptable |
| **scholar.archive.org** (fatcat) | `200`, body is *"Session Verification"* | not scriptable |
| **PhilPapers** | `403` | philosophy only |
| **Zenodo** | `403` twice | **use DataCite instead** — it exposes Zenodo DOIs |
| **OATD** (theses) | `403` | theses remain uncovered |
| **EEF toolkit**, **Campbell Collaboration** | `403` Cloudflare / Wiley | no API exists |
| **WWC** | `200` HTML only | no machine-readable endpoint |
| **J-STAGE** (Japan) | `200` but `ERR_012`; 0 confirmed hits with `material=article` | **unresolved** — API exists, parameters unclear |
| **PubAg** (USDA), **AGRIS** (FAO) | `404` on both attempted paths | **unresolved** — endpoints not confirmed |
| **SciELO search frontend** | `403` | the `articlemeta` API works instead |
| **OpenAIRE legacy** `/search/publications` | no connection | superseded by the Graph API |

**Paid or closed, out of scope:** Scopus · Web of Science · Dimensions · JSTOR · Project MUSE ·
PsycINFO · EconLit · ATLA · British Education Index · MLA Bibliography · MathSciNet · CNKI · KCI ·
Cochrane Library API.

## What this means for "comprehensive"

**More bibliographic indexes is the weakest lever available.** Nine of the reachable sources above
overlap OpenAlex substantially. The three that are genuinely additive are additive for *different
reasons*:

- **PubPeer** — a signal, not records, and domain-neutral: criticism exists in every field.
- **DataCite** — a different *object type*. Datasets and software are cited constantly and are
  invisible to every bibliographic index.
- **SciELO / CiNii / OpenAIRE** — coverage where OpenAlex is weakest: non-English and regional
  scholarship. OpenAlex is English-biased and its Global South coverage is uneven.

**A warning about ranking.** `rankScore()` is validated by hand-adjudicated nDCG (0.94). New sources
flow through `dedupe()` and that same scoring, so adding one can shift ranking across every existing
query. Any addition must re-run the ranking evaluation before shipping — a source that improves
recall while degrading nDCG 0.94 is not an improvement.

**What I did not measure.** Whether SciELO/CiNii records are *already* in OpenAlex. The test
(resolve a real record, then query OpenAlex for its DOI) came back inconclusive: the sampled 1998
SciELO article carries no DOI, so there was nothing to look up. The claim that regional indexes are
additive is reasoned from OpenAlex's known English bias, **not measured**. Worth measuring before
building the adapter.

## Limits and failover — measured, not documented

OpenAlex is the only **metered** source in the set. Everything else is free with no dollar budget.
On *rate*, OpenAlex is also among the most generous — which inverts the usual assumption.

| source | advertised limit | cost | measured burst |
|---|---|---|---|
| **openalex** (keyed) | 30 req/s, $1/day | metered | — |
| **openalex** (keyless) | 10 req/s, $0.10/day **shared per IP** | metered | 100% 429 at $0 |
| **crossref** | **3 req per 1 s** (`x-rate-limit-limit: 3`) | free | **9/12 → 429** |
| **openaire** | `x-ratelimit-limit: 7199` | free | — |
| **pubpeer** | `x-ratelimit-limit: 20` | free | — |
| **epmc** | none advertised | free | **12/12, no throttle** |
| **doaj** | none advertised | free | **12/12, no throttle** |
| **eric** | none advertised | free | **12/12, no throttle** |
| **datacite** | none advertised | free | **12/12, no throttle** |
| **unpaywall** | none advertised (email required) | free | **12/12, no throttle** |
| **semantic scholar** (keyless) | 1 req/s documented | free | 6/6 |
| **arxiv** | 1 request / 3 s documented | free | — |

Three conclusions that matter:

1. **Do not use Crossref as an OpenAlex rate backup.** At 3 req/s it is *stricter* than OpenAlex
   keyless (10/s), and a 12-request burst produced three 429s. It is a fine source; it is not a
   throughput substitute.
2. **The genuinely unmetered backends are EPMC, DOAJ, ERIC, DataCite and Unpaywall** — none
   throttled across a 12-request burst and none carry a dollar budget.
3. **The binding constraint is budget, not rate.** `x-ratelimit-limit: 1000` credits with `10`
   credits per search means ~100 searches on the keyless $0.10, and ~1,000 on a $1 key. The
   response also carries `x-ratelimit-reset` (seconds), which is what the low-budget warning could
   quote instead of just a percentage.

### Failover by layer

CiteKit touches OpenAlex in two independent places, and they need different answers.

**Search layer — already redundant.** `search.mjs` queries six sources in parallel and records
per-source errors (`openalex: HTTP 429` appears in the query's `errors`). A run survives an OpenAlex
outage, but the results are thinner: no `is_retracted`, no `type`, weaker enrichment.

**Integrity layer — a real single point of failure.**

| check | OpenAlex role | viable backup | verdict |
|---|---|---|---|
| retraction screen | `is_retracted` on a batched list call | Crossref `filter=update-type:retraction` (76,515 notices) and `filter=updates:<DOI>` | **partial** — returns 0 for `10.1378/chest.128.6.3817`. A Crossref-only fallback must announce itself as degraded, or it recreates the silent-clean-screen bug |
| OA location for quote checks | `best_oa_location` + `locations` | **Unpaywall** — 12/12 unthrottled, adds `host_type` and `version` | **good**, with a caveat: it returned the same three 403-ing locations for the MDPI paper, so it fixes *provenance*, not *fetchability* |
| critique signal | not an OpenAlex feature | PubPeer | orthogonal, not failover |

**Untested:** whether the nominally-free single-entity lookup survives a `$0` budget. The pricing
page calls single-entity retrieval Free/Unlimited, but during the exhaustion event requests 429'd
across the board. Treat the whole API as unavailable at `$0` until that is measured.

**Recommendation:** with a key at $1/day the budget constraint is 10× looser and effectively gone for
normal use. If failover is built, build it for the **retraction screen** only — and have it say
*"degraded: Crossref only, may miss retractions"* rather than silently substituting. Adding sources
for rate reasons is not worth it; adding them for coverage reasons (see above) is.

## Recommended order

Status after this round — the first two tiers are **built and tested**:

| tier | source | status |
|---|---|---|
| 1 | **PubPeer** | **done** — `critiqueDois()`, batched at 50/call, runs on every search, `--no-critique` to skip. Proved on a live search: 17 comments surfaced on a paper that is not retracted |
| 1 | **DataCite** | **done** — `dataciteDoi()`, consulted when OpenAlex 404s a DOI so a dataset is reported as a dataset |
| 2 | **Unpaywall** | **done as a backstop** — `unpaywallDoi()`, used only when OpenAlex has no copy and only when `CITEKIT_UNPAYWALL_EMAIL` is set; adds `version` provenance |
| 2 | **Crossref degraded screen** | **done** — self-declaring, paced at the measured 3 req/s, capped, reports `checked/requested` |
| 2 | **SciELO** (CLI), **CiNii** | **measured — do not build.** Recent SciELO articles were 8/8 already in OpenAlex; CiNii records rarely expose a DOI at all, so they cannot be deduplicated. See "Still open" |
| 2 | **OpenAIRE** | not built — overlaps OpenAlex most of all |
| 2 | **bioRxiv / medRxiv** | not built |
| 3 | **NASA ADS**, **CourtListener** | not built — free tokens, follow the `s2`/`core` opt-in pattern |
| — | **zbMATH**, **Figshare**, **Open Library** | not built, low urgency |
| — | everything bot-walled or paid | do not attempt |

## Still open

- **The overlap measurement — now done, and it says do not build.** Two samples, both taken from
  *recent* records (the first attempt failed by sampling the oldest pages, which predate DOIs):
  - **SciELO: 8 of 8.** Recent articles from `articlemeta` were resolved to DOIs and looked up in
    OpenAlex: **every one was already there**, including Portuguese-language ones. One apparent miss
    (`10.1590/1806-9304202400000080err-en`) turned out to be **unregistered at Crossref too** — bad
    metadata in the SciELO record, not missing coverage. The "regional indexes are additive because
    OpenAlex is English-biased" hypothesis is **falsified for DOI-bearing records**. A SciELO adapter
    would add duplicates.
  - **CiNii: not deduplicable.** Only **1 of 6** sampled records exposed a DOI even in its full
    `.json`; the rest are NCID-/crid-addressed, and the first sample was a 1911 book. Matching would
    have to be title-based, which is lossy exactly where it matters (Japanese titles, romanisation).
    A CiNii adapter would need a fuzzy matcher before it could be trusted, and most of what it adds
    is pre-DOI print.
  - **What this means:** the two tier-2 regional adapters should stay unbuilt. Breadth is not
    where the remaining risk is; the risk is in what a *result* means, which is what the ledger,
    quote checks and critique screen address.
- **Whether a `$0` budget kills the nominally-free single-entity lookup.** Recorded as untested.
- **A critique check has no notion of a stale comment count** — deliberately never cached, so a
  repeat run re-asks PubPeer. That is one extra call per run; acceptable, but it is a cost.

## Out of scope

Scraping bot-walled sources (Anubis, Cloudflare, proof-of-work, session verification) — brittle,
likely contrary to their terms, and largely duplicative of OpenAlex. Paid indexes. Full text of
in-copyright books: no database provides it, which is why the claim ledger has a `book not read`
access level and reports *"could not check"* rather than guessing.
