# Source coverage — gaps and what can actually fill them

Researched 2026-10-29 by probing every candidate endpoint directly (curl, browser User-Agent,
`%{http_code}` recorded) rather than trusting documentation or blog posts. Every verdict below is
backed by a response code obtained during this session. Where a probe was inconclusive, it says so.

CiteKit currently searches ten sources, six by default:

| source | upstream | default | auth |
|---|---|---|---|
| openalex | api.openalex.org | yes | keyless $0.10/day, or key $1/day |
| crossref | api.crossref.org | yes | keyless |
| epmc | ebi.ac.uk (Europe PMC) | yes | keyless |
| pubmed | eutils.ncbi.nlm.nih.gov | yes | keyless |
| eric | api.ies.ed.gov | yes | keyless |
| doaj | doaj.org | yes | keyless |
| s2 | api.semanticscholar.org | opt-in | key |
| arxiv | export.arxiv.org | opt-in | none |
| core | api.core.ac.uk | opt-in | key |
| web | api.tavily.com | opt-in | keyless or key |

Adding more *citation indexes* is close to worthless: OpenAlex indexes ~300M works and the others
read substantially overlapping corpora. What is missing is not more bibliographic coverage but
missing *kinds* of information — post-publication critique, book existence, and evidence quality.

---

## Gaps

1. **Post-publication critique.** A paper can be heavily criticised without being retracted, and
   nothing in the current ten sources reports that. This is the same failure class as a silent
   retraction screen: absence of a warning is not evidence of safety.
2. **Books.** No source covers them. `Bengtson 2013` sits in `family/habits/citations.map.json` as
   unmapped, and no citation index can help.
3. **Theology / religious studies.** No dedicated source. OpenAlex and DOAJ carry some of it.
4. **Evidence quality.** Whether a study met an evidence standard (WWC, EEF) is a judgement no
   citation index records.

## What can actually fill them

### 1. PubPeer — recommended, verified working

Post-publication review, and it batches by DOI. This is the same shape as the existing retraction
screen, so it costs one call per run.

```
POST https://pubpeer.com/v3/publications?devkey=PubPeerZotero
{"dois":["10.1038/s41419-019-1320-z","10.1080/15548627.2015.1100356","10.3390/rel10020111"]}

HTTP 200 — 2 of 3 returned
  10.1038/s41419-019-1320-z        17 comments
  10.1080/15548627.2015.1100356    35 comments
```

Both of those papers are **not retracted** — they would pass the current screen as clean. That is
the gap, demonstrated rather than asserted. The devkey is the one Zotero and the `metacheck` package
use; it is public and free. PubPeer's own FAQ says a general API is forthcoming, so pin the devkey
and treat it as best-effort.

### 2. Crossref `filter=updates:` — useful supplement, does not close the known hole

Given a work's DOI, Crossref reports the notices that update it. Keyless and precise:

```
GET https://api.crossref.org/works?filter=updates:10.1177/1758835919874651&select=DOI,type,update-to
HTTP 200 — total 1
```

**But it returns `total: 0` for `10.1378/chest.128.6.3817`** (Chest 2005, retracted 2008), the
control case this repo already uses. So Crossref's coverage is genuinely incomplete and OpenAlex's
`is_retracted` remains necessary. Use `updates:` as a cross-check and as a fallback when OpenAlex is
rate-limited, not as a replacement. Crossref also 429s after rapid successive queries — needs backoff.

`filter=update-type:retraction` enumerated **76,515** retraction notices, which is the right shape
for bulk screening but not for "is this one DOI retracted".

### 3. Open Library — fills book existence, not book quotes

```
GET https://openlibrary.org/search.json?q=soul+searching+denton
HTTP 200 — numFound 2, with title / author_name / first_publish_year / isbn
```

This answers "does this book exist as cited, and is the ISBN right?" — a real improvement over a
citation that currently cannot be checked at all. It does **not** answer "is this quotation
correct", because it is a metadata catalogue.

**Reliability caveat:** it answered once, then became entirely unreachable from this network
(`curl: (7) Failed to connect ... after 169 ms`) and stayed that way through three retries. Treat as
opportunistic and non-blocking.

---

## Dead ends, with the evidence

These were probed and rejected. Recording them matters so nobody re-investigates.

| candidate | probe result | consequence |
|---|---|---|
| **IxTheo** (theology, 4.5M entries) | `GET ixtheo.de/OAI?verb=Identify` → HTTP 200 but the body is `"Verifying your browser"` — an anti-bot proof-of-work page, not XML | requires solving a PoW challenge; not worth it for bibliographic metadata OpenAlex largely carries |
| **RelBib** (Tübingen, open) | HTTP 200, identical 2146-byte challenge page | same |
| **HathiTrust** full-text | HTTP 403, "Just a moment…" (Cloudflare) | full view is public-domain only anyway |
| **scholar.archive.org** (fatcat) | HTTP 200, but body is "Session Verification" | bot-walled |
| **PhilPapers** | HTTP 403 | philosophy only; not a gap for this work |
| **Zenodo** | HTTP 403 | research data, not literature |
| **Google Books** | HTTP 429, `Quota exceeded for quota metric 'Queries' per day` on the shared anonymous project | needs your own GCP key, and returns **snippets**, not verifiable text |
| **EEF toolkit** | HTTP 403 (Cloudflare) | no API; manual reading only |
| **Campbell Collaboration** | HTTP 403 (Wiley) | no API |
| **WWC** | HTTP 200 HTML, no JSON endpoint | no machine-readable API |
| **Internet Archive full-text API** | `ia-fts.archive.org` has no DNS record | the documented host does not resolve |
| **Open Library "search inside"** | HTTP 200 but JavaScript-rendered — curl sees an empty shell, and the browser backend was unavailable this session (`provider not entitled`, Edge holding the profile lock) | **unverified**; would need Playwright, which this CLI deliberately does not depend on |
| **Scopus / Web of Science / ATLA / British Education Index / JSTOR / Dimensions** | paid and closed | out of scope |

## The gap that no database closes

`Bengtson 2013` and `Smith & Denton 2005` are in-copyright books. **There is no lawful full-text API
for an in-copyright book.** Google Books returns snippets behind a quota; HathiTrust gives full view
only for public-domain works; the Internet Archive lends them to humans, not to scripts. So a
quotation from a 2013 book cannot be machine-verified, at any price short of a licence.

This is not a defect to fix. It is why the claim ledger has a `book not read` access level: the tool
reports *"could not check"*, which is the correct answer. The honest failure mode is a named gap, not
a guess.

## Recommendation

| action | value | cost |
|---|---|---|
| Add **PubPeer** as a fourth batchable check | high — a signal no other source has | ~40 lines + tests |
| Add **Crossref `updates:`** as a retraction cross-check | medium — resilience when OpenAlex 429s | ~20 lines |
| Add **Open Library** for book existence | low-medium — verifies ISBN/title/year | ~30 lines, unreliable host |
| Add anything else | none demonstrated | — |

Implement PubPeer first. It is the only one that reports something the tool currently cannot see at
all, and the demonstration above (17 and 35 comments on two non-retracted papers) is the case for it.

## Out of scope

- Scraping bot-walled sources (IxTheo, HathiTrust, scholar.archive.org) — brittle, likely against
  their terms, and the metadata overlaps what OpenAlex already has.
- Paid indexes.
- Full text of in-copyright books.
- Evidence-quality judgements (WWC/EEF) — no API exists; better captured manually in the ledger.
