# Scholarly APIs — verified source table

Everything here was probed live. A probe table goes stale — when a status contradicts it, re-probe
before repeating the claim, and update this file.

## Browser-callable (send `Access-Control-Allow-Origin`), no key

| Source | Host | Cost | What it gives | Quirks |
|---|---|---|---|---|
| **OpenAlex** | `api.openalex.org` | $0.10/1k list, **$1/1k search**; $1/day free per key, ~1000 calls anonymous | 300M+ works, richest metadata, abstracts reconstructable, `fulltext.search` covers title+abstract+full text | `is_oa` lives at `open_access.is_oa`, **not** top level (the *filter* `is_oa:true` is a top-level alias — a common trap). Search is billable; `per_page=100` to stretch a budget |
| **Crossref** | `api.crossref.org` | free | Publisher-deposited metadata + DOI resolution; abstracts sometimes | Abstracts arrive with JATS/HTML tags — strip them |
| **Europe PMC** | `www.ebi.ac.uk/europepmc/webservices` | free | ~97% abstract coverage on a sample; OA full text via PMCID; indexes preprints | Can return `errCode` inside an HTTP 200 |
| **PubMed** | `eutils.ncbi.nlm.nih.gov` | free | Biomedical index (esearch + esummary; abstracts need efetch) | esummary has no abstract — don't present that as "no data" |
| **ERIC** | `api.ies.ed.gov` | free | The education index — the one general-purpose sources miss for teaching/reading research | Long research abstracts; `ED####` records usually serve a PDF at `files.eric.ed.gov/fulltext/<id>.pdf` but **per-record, not uniform** (verified: some 404) — label it a link, never "open access" |
| **DOAJ** | `doaj.org/api` | free | Gold open-access journals only → **100% OA by construction**, with direct full-text links | Bare multi-word queries are **AND** (4 words → 2 hits); widen deliberately to OR when thin, and dedupe the widened page against the original |

## Key-gated

| Source | Why it needs one | Proxy doesn't help |
|---|---|---|
| **Semantic Scholar** (`api.semanticscholar.org`) | no CORS header **and** a small shared anonymous pool that 429s quickly — verified from a Cloudflare Worker's IP too | a proxy fixes CORS, never a quota. Free key required |
| **CORE** (`api.core.ac.uk`) | 300M+ OA repository works with direct `downloadUrl` PDFs, but the keyless anonymous quota 429s after a handful of requests | same — free key required |
| **arXiv** (`export.arxiv.org`) | no CORS header (key not needed) | a passthrough worker **does** fix this one |

## Coverage reality (measured, OpenAlex)

- 327M works · **39%** open access · **16%** cached full text · **55%** with an abstract.
- Per-query samples skew higher (~95% OA for a hot recent topic) — quote the corpus figure, not the flattering sample.
- Implication: metadata reaches nearly everything, analysis reaches much less. Badge the difference
  in any UI and tell the user which they got.

## Merging many sources: enrich, then rank

Fan-out buys real recall — nine sources returned 124 raw → 108 unique for one query, each source
contributing ~18 records no other returned. It also dilutes metadata: a raw union scored **worse**
on "can the model read this" than the single richest source (OA 43% vs 95%).

**Fix with one batched DOI lookup after dedupe:** up to 50 DOIs per call
(`filter=doi:a|b|c`, ~$0.0001, use `select=` to shrink the payload) returns OA status, best PDF,
citations, year, journal — and the abstract where held. Measured: OA 43% → 65%, abstracts
69% → 86%, full-text links 45% → 69% (90 of 108 matched). Best-effort only; never fabricate a
field the source lacks.

**Then rank deterministically** and trial every signal on live data first. A length-naive scorer
(divide by √word-count) lets a 10-word title outrank a 1,500-word abstract — keep each lexical term
bounded 0..1. Cross-source consensus sounds right and is measurably wrong: only ~7% of a merged pool
is returned by more than one source, and those records averaged 5-6 citations against 70-217 for
single-source records. Show it as a pill; never score it.

## Evaluated and rejected

| Source | Why not |
|---|---|
| BASE (400M+, ~60% OA) | registration + IP allowlist — unusable from a browser |
| OpenAIRE | no CORS, and overlaps OpenAlex heavily |
| Internet Archive Scholar / fatcat | search 302s, no clean JSON API |
| Zenodo / DataCite | datasets and software, not literature |
| bioRxiv / medRxiv APIs | serve by DOI or date window, **not keyword** — cannot back a search box (Europe PMC already indexes preprints) |
| Scopus / Web of Science / Dimensions | commercial, contract-gated |
| Google Scholar | no public API; scraping violates ToS |
| PMC OA / BioC | already reachable through Europe PMC |

## Licences before redistribution

- **OpenAlex: CC0** — no restrictions.
- **Crossref:** no signup, metadata near-copyright-free, but **publisher-deposited abstracts may be copyrighted**.
- **Europe PMC / PubMed:** free, rate-limit policies apply.
- **Semantic Scholar:** the operator's own API licence with attribution terms — not public domain.

## Dedupe and export

Join on lowercased DOI (`https://doi.org/` and `dx.` stripped), falling back to a normalized title,
and keep provenance. Export **BibTeX / RIS / CSL-JSON** so a reference manager can take over; CSL-JSON
is the interchange format that pairs with the citation-style repository.
