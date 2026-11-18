# Verify a local checkout before trusting a run

A rejected key does not crash the pipeline — it degrades it. The retraction screen falls back to
Crossref, `get_record` fails, and `expand_citations` returns nothing, while the search itself keeps
returning plausible records. Run these three checks before quoting any result that rests on
retraction status.

```bash
node --version                      # 18+ ; tests need nothing else
node tests/mcp-server.mjs           # expect: 19/19 — all passed
node tools/search.mjs --list-sources
```

## The 401 signature

Probed on a real checkout (node v22.23.2): a stale `CITEKIT_OPENALEX_KEY` produces

```
⚠ RETRACTION SCREEN DEGRADED — OpenAlex rejected the API key (HTTP 401) …
```

and `node tests/mcp-server.mjs` reports **16/19**, with all three failures naming
`OpenAlex HTTP 401` (`get_record`, structured-content, `expand_citations`). Unset the variable and
the same suite is **19/19** — which is what proves the *key* is at fault rather than the code:

```bash
env -u CITEKIT_OPENALEX_KEY node tests/mcp-server.mjs    # 19/19 → the key was the only problem
```

Confirm this before editing an adapter. A 401 that is really a key problem looks exactly like a
broken endpoint, and "OpenAlex is down" is the wrong fix.

## Keys

Env vars: `CITEKIT_OPENALEX_KEY`, `CITEKIT_S2_KEY`, `CITEKIT_CORE_KEY`, `TAVILY_API_KEY`.
All optional; keyless covers OpenAlex (small daily budget), Crossref, Europe PMC, PubMed, ERIC,
DOAJ and Tavily-with-limits. Store them in an env file outside the repo, never in a tracked one.
Re-issue a rejected OpenAlex key at openalex.org → Settings → API key, then re-run the suite: a good
key turns 16/19 into 19/19 and clears the degraded banner.
