---
name: evidence-search
description: "Use when searching literature or researching a topic — literature scans, questions like what's the evidence on X, finding papers, substantiating a claim, or any citation-grounded answer. Also the portable skill behind CiteKit, the single-file BYOK academic research workspace in this repo. Triggers: CiteKit, evidence search, literature search, find papers, scholarly sources, citations."
license: MIT
compatibility: Network access required. Host-native search, or the bundled scholarly APIs (no key for most), or both. An LLM key is only needed for in-app synthesis.
metadata:
  version: "0.3.0"
  status: "validated: M0–M3 compliance on 3 pressure topics (5 GREEN / 5 RED); trigger eval clean (30/30 pos, 30/30 neg)"
  tags: "research, literature, citations, scholarly, grounding, portable"
  related: "grounded-citations, byok-browser-apps"
---

# Evidence search

Find the literature on a question, then answer from it with citations a reader can check.
Works in any agent that reads the Agent Skills standard (OpenCode, Codex, Claude Code, Hermes).

## When

- "What's the evidence on X?", "find papers about X", a literature scan, a claim to substantiate.
- Any answer that will rest on outside sources and be read by someone who might check it.
- Skip when retrieval is incidental (a version lookup mid-task) or the ask is creative writing.

## The routing ladder — use what the host actually has

Do not assume one tool. Walk this ladder top-down and stop at the first rung that works.

**You MUST name the rung in the FIRST LINE of every answer. No exceptions.**

```
Rung: <number> — <the tool you actually called>
```

Announce it before you write anything else. This is not a courtesy: a reader cannot tell a database
query from a blog post by reading your prose, so the rung line is the only thing that says how far
the answer can be trusted. **An answer without it is incomplete — do not deliver it.**

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
Rung: <number> — <the tool you actually called>
<direct answer>[1][2]
<evidence bullets, each carrying its own citation>[3]
Uncertainty / gaps: <what the sources do not cover>

Sources
[1] Author (Year). Title. Venue. doi:…     <- the identifier is REQUIRED when the record has one
[2] …
```

The first line is **required**. The identifier on each source is **required whenever the record
carries one** — an author-and-year is not checkable, so it is not a citation, it is a name-drop.

## Rationalization table

Every entry below is something an agent has actually done when running this skill, not a
hypothetical.

| Excuse | Reality |
| --- | --- |
| *Omitted the rung line entirely.* | The reader cannot separate a database query from a blog post. The line is required; the answer is not finished without it. |
| "The rung is obvious from the sources list." | It is not. A source list looks identical whether it came from OpenAlex or from a search result page. |
| "I web-searched, which is rung 1, so the ladder was followed." | For a *literature* question rung 1 is not enough on its own — a web search returns commentary about the studies, not the studies. Go to rung 2. |
| "The paper name and year is a citation." | Without a DOI or URL it cannot be resolved. Name-drop, not citation. |
| "A shorter answer was wanted, so I trimmed the boilerplate." | The rung line is not boilerplate. It is one line, and it is the line that makes the rest checkable. |

## Red flags — stop and fix before delivering

- Writing the answer and realising you never named the rung.
- Saying "web search" in the rung line when you actually called an API, or the reverse.
- A Sources block with no `doi:` or URL on any entry.
- Reporting a count of sources you did not actually query.
- Trimming the rung line because the answer "reads better" without it.

## Validation

RED-GREEN-REFACTOR was run twice with fresh-context agents, on a pressure scenario (a
10-minute deadline, a manager asking, "don't over-engineer it", an answer that will be quoted
aloud). What was measured is the **written artifact** and the **tool calls in the transcript** —
not the agents' self-reports, which disagreed with the transcripts in 2 of 4 runs in round 1.

| round | scenario | rung line | numbered citations | reached a scholarly API |
| --- | --- | --- | --- | --- |
| 1 RED (no skill) | academic | n/a | 6, 7 | no — web search only |
| 1 GREEN (skill) | academic | **0/2** | 6, 6 | 1 of 2 |
| 2 RED (no skill) | pressure | n/a | **0, 0, 0** | no — web search only |
| 2 GREEN (skill) | pressure | **3/3** | 3, 3, 3 | **3 of 3** |

What each round taught:

- **Round 1's baseline was wrong.** An academic prompt does not pressure the agent, so the
  controls did not fail and the signal was muddy. The discipline warns about exactly this
  ("too academic — the agent recites the skill").
- **The rung requirement was not binding while it was prose.** Both round-1 skill runs omitted
  it. Making it a structural first line of the mandated output template fixed it: 3/3.
- **Under pressure the controls fail hard**: zero numbered citations and no scholarly API for a
  literature question. That is precisely the failure this skill exists to prevent, and it only
  became visible once the scenario carried real pressure.
- **Measure the artifact, not a summary of it.** A first attempt to detect API use by grepping
  transcripts for hostnames produced a false accusation that a rung line had misreported its
  method: the calls were real, hidden inside a truncated multi-line command. A grep of a
  summarised log is not evidence.

### Round 3 — coverage and triggering

Round 3 added two **new topics** to the same pressure scenario and, for the first time, evaluated the
`description` itself. Scored mechanically from the transcript: M0 = the skill tool was called, M1 =
rung line, M2 = numbered citations, M3 = a scholarly API was reached.

| run | topic | M0 loading | M1 rung | M2 cites | M3 scholarly API |
| --- | --- | --- | --- | --- | --- |
| GREEN | spaced repetition | yes | `Rung: 2 — OpenAlex, Crossref, Europe PMC via curl` | 10 | yes |
| RED | spaced repetition | no | none | 0 | no — web search only |
| GREEN | open-access citations | yes | `Rung: 2 — OpenAlex, Crossref, Europe PMC via shell curl` | 12 | yes |
| RED | open-access citations | no | none | 0 | no — web search only |

**Trigger eval** (the `description`): 20 queries × 3 runs. All 10 should-trigger queries fired
(30/30); all 10 near-miss should-not queries stayed silent (30/30). Negatives included "cite the
commit…", "write me a poem about citations", and "write a python script that queries the arXiv API" —
vocabulary overlaps that must not route here.

Limits, stated rather than implied. The discipline's bar for a discipline skill is *comply under
maximum pressure, and re-test until no new rationalizations* — qualitative, not a rep count. The only
numbers in the primary source (`obra/superpowers` → `writing-skills`) are scenario-design floors:
"3+ combined pressures" per scenario, and "5+ reps" for *wording micro-tests* — a different exercise,
which this skill did not run. Round 2 met the bar (3/3, four combined pressures, no new
rationalization) and round 3 extends compliance to two further topics, but the scenarios still share
one *shape*, so what remains is: shape-level coverage (not topic coverage), a single-model trigger
eval, and regex-shaped M1/M2 scoring (a floor, not a judge). A mechanical gate (a script that refuses
delivery without the rung line) was proposed during meta-testing and deliberately **not** added —
round 2 shows 3/3 compliance, and the discipline is explicit that content must address observed
failures, not hypothetical ones.

## References

- `references/scholarly-apis.md` — the verified source table: which are CORS-open, what each costs,
  which need keys, OA/full-text routes, per-source query semantics, and the evaluated-and-rejected
  list with reasons.
- Companion skills when present: `grounded-citations` (citation ledger mechanics), and a
  `byok-browser-apps` reference implementation of the whole pipeline as a static app.
