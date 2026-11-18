# Quickstart: OpenAIRE and ClinicalTrials.gov

This guide describes the shipped feature. Live checks still depend on upstream API availability.

## Browser app

1. Serve the repository with `python3 -m http.server 8777`.
2. Open `http://localhost:8777/` in Chromium.
3. Enter a topic and opt in to **OpenAIRE** and/or **ClinicalTrials.gov**. Both are off by default.
4. OpenAIRE appears with scholarly papers and its source/review/access metadata. ClinicalTrials.gov appears in a separate **Registered studies** section with NCT link and current registry status.
5. A registry entry means a study is registered; it does not, by itself, indicate results or benefit.

## CLI

```bash
node tools/search.mjs "exercise cognition" --sources openalex,openaire,clinicaltrials --json --fresh
```

Paper records remain in the existing records list; trial records are separate under `trials`. OpenAIRE requests one bounded page capped at 25; ClinicalTrials.gov caps at 20. Trial citations export as registry records, not journal articles.

## MCP

Call the existing `search_literature` tool with `sources: ["openaire", "clinicaltrials"]`. Scholarly `records` and the separate `trials` array are returned together.

## Verify

Run:

```bash
node tests/verify.mjs
node tests/browser.mjs
node tests/mcp-server.mjs
node tests/tools-search.mjs
node tests/proxy-integration.mjs
```

Both live source checks require network access. Browser-callability must be verified in Chromium from the served app origin, not inferred from the CLI.
