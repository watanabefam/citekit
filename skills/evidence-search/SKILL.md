---
name: evidence-search
description: Use when searching literature or researching a topic.
license: MIT
compatibility: Network access required. Host-native search, or the bundled scholarly APIs (no key for most), or both. An LLM key is only needed for in-app synthesis.
metadata:
  version: "0.1.0"
  status: draft
  tags: [research, literature, citations, scholarly, grounding, portable]
  related: [grounded-citations, byok-browser-apps]
---

# Evidence search

Find the literature on a question, then answer from it with citations a reader can check.
Works in any agent that reads the Agent Skills standard (OpenCode, Codex, Claude Code, Hermes).

## When

- "What's the evidence on X?", "find papers about X", a literature scan, a claim to substantiate.
- Any answer that will rest on outside sources and be read by someone who might check it.
- Skip when retrieval is incidental (a version lookup mid-task) or the ask is creative writing.

## The routing ladder — use what the host actually has

Do not assume one tool. Walk this ladder top-down and stop at the first rung that works. Say
which rung you used, because the answer's trustworthiness depends on it.

**1. Host-native research tool.** Almost every host ships one, and it is the cheapest path for
web and general questions.
- OpenCode: its built-in Exa/web search (`webfetch`, `websearch` or the Exa MCP) — often already configured.
- Claude Code: `WebSearch` / `WebFetch`.
- Hermes: `web_search`, `web_extract`, `browser_exec`.
- Codex: its web search tool when enabled.
If the host exposes one, use it first and cite it like any other source.

**2. The scholarly APIs — for anything that is *literature*.** A general web search is not a
literature database: it will miss most of the record and cannot tell you whether a paper is
retrievable. Call these directly; none need a browser, and only two need a key. See
`references/scholarly-apis.md` for the verified table (CORS, cost, OA coverage, per-source
query quirks) — read it before choosing sources, not after results look thin.

**3. Shell fallback.** `curl` the same endpoints. Server-side calls have no CORS constraint, so
anything the table lists as "needs a proxy" is still reachable from a terminal. Prefer this when
no host search tool exists at all.

**4. Escalate to deep research** only when the question needs synthesis across many sources and
the host has an agentic deep-research mode. It is the slowest and least reproducible rung.

## Procedure

1. **Decide the question type first** — a factual claim, a literature scan, or a "what's the
   state of the field" question. Literature scans go to rung 2 even when rung 1 succeeds; a web
   search will return blog posts about the topic instead of the studies.
2. **Pool, don't pick.** Query two or three sources, not one. Their top results are largely
   disjoint — measured across a nine-source fan-out, each source contributed roughly 18 records
   no other source returned. Dedupe by DOI (falling back to normalized title) and keep provenance,
   so a record can say which sources returned it.
3. **Number the sources before you write.** Hand the model only the numbers you created. This is
   the mechanism that makes `[n]` verifiable rather than decorative.
4. **Cite per sentence**, `[n]`, max three ids; allow page qualifiers `[1, p.4]` when the text has
   pages. Never emit an id you were not given, and never invent a DOI or a quotation.
5. **Say when the sources don't answer.** "The provided sources do not answer this" beats a
   plausible sentence with a citation bolted on. Output a source list mapping `[n]` → title, year,
   DOI/URL so the reader can check every claim.
6. **Persist the judgments/sources as data** (JSON or the host's ledger) instead of retyping them.

## Rules

- **A citation is a promise about provenance, not a decoration.** If the cited source does not
  contain the claim, the citation is worse than none — it converts a gap into a false confidence.
- **Availability changes the answer.** Metadata reaches far more of the record than full text does:
  in a large scholarly corpus roughly a third is open access, about a sixth has cached full text,
  and half has abstracts. Say which you had for each source, and prefer sources you can actually
  quote. A confident synthesis over abstracts alone is a weaker artifact and should be labelled.
- **Never claim a metric or a database behaviour you have not verified.** A published probe table
  is a starting point; when a status contradicts it, vary the one variable you believe is
  responsible and repeat before naming a cause. A wrong mechanism, written into a comment or an
  answer, outlives the puzzle it came from.
- **Validate the shape of a response, not its status code.** Several scholarly APIs answer a
  rejected query with HTTP 200 and a body that is not a result set; one silently rewrites a bad
  query and returns a plausible unrelated paper. An adapter that maps a missing container to `[]`
  renders a broken source as "no results".
- **Respect the keys and the quotas.** Metered endpoints report cost in the response; a "no key
  needed" API usually means a small shared pool that will 429 under real use. Never ask a user for
  their key in chat, never type one into a page, never write one into a repo.
- **A free API is not free content.** Check the per-source licence before redistributing what an
  API returns — public-domain metadata and publisher-deposited abstracts are not the same thing.

## Output shape

```
<direct answer>[1][2]
<evidence bullets, each carrying its own citation>[3]
Uncertainty / gaps: <what the sources do not cover>

Sources
[1] Author (Year). Title. Venue. doi:…
[2] …
```

## References

- `references/scholarly-apis.md` — the verified source table: which are CORS-open, what each costs,
  which need keys, OA/full-text routes, per-source query semantics, and the evaluated-and-rejected
  list with reasons.
- Companion skills when present: `grounded-citations` (citation ledger mechanics), and a
  `byok-browser-apps` reference implementation of the whole pipeline as a static app.
