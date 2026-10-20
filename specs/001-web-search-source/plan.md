# Implementation Plan: Web Search Source

**Feature**: `001-web-search-source` · **Date**: 2026-10-20 · **Spec**: [spec.md](spec.md)

**Note**: This plan records the approach as built. The feature was implemented directly from the
approved spec on 2026-10-20; it is written down here so the next change has a technical baseline and
so the spec-to-code mapping is traceable.

## Summary

Add a Tavily-backed web lane to CiteKit's three surfaces — browser app, MCP server, and CLI — without
a backend, without a build step, and without moving API keys off the user's machine. Web results are
on by default, labelled not peer-reviewed, ranked separately from papers, and capped so they cannot
crowd out scholarly sources.

## Technical Context

- **Runtime**: modern browser (`fetch` + `AbortController`); Node 18+ for tools and tests.
- **Provider**: Tavily `POST https://api.tavily.com/search`.
  - Keyless: `X-Tavily-Access-Mode: keyless` (rate-limited).
  - BYOK: `Authorization: Bearer <key>` from `localStorage` / process environment.
- **Transport**: browser-direct. CORS verified in real Chromium on 2026-10-20 (HTTP 200).
- **No new dependency** in the app or tools. Tavily CLI and global skills are optional local tooling,
  not app dependencies.
- **Key custody**: browser key stays in `localStorage`; MCP/CLI key comes from `TAVILY_API_KEY` or
  `CITEKIT_TAVILY_KEY`. No key is written to the repository.

## Architecture

```
index.html
  searchWeb()          → Tavily search with raw page content
  canonicalUrl()       → URL dedupe key
  rankWebResults()     → lexical relevance over Tavily order
  dedupeWeb()          → canonical-URL dedupe
  WEB_RESULTS          → separate web state
  #src-web             → checked by default
  .websec / .card.web  → separate labelled section
  buildContext()       → web slots, max half the context
  SYSTEM               → web text is untrusted data

tools/load-ll.mjs      → loads the shipping script for Node
tools/mcp-server.mjs   → search_web tool, env key, version 1.1.0
tools/search.mjs       → --sources web, --tavily-key, --web-domains, --web-time

tests/                 → live HTTP + real Chromium, no HTTP mocks
```

## Design Decisions

1. **Separate lane, not a tenth scholarly source.** Web records never enter `rankResults()` and are
   never merged with a paper by title. This preserves the meaning of the scholarly ranking.
2. **Default on.** The user asked for web research by default; it can be unchecked per search.
3. **Keyless first, key optional.** Keeps the no-account promise and gives an immediate path when the
   user has no key. A free key raises limits.
4. **Cap at 6,000 characters per page and at half the context slots.** Prevents a default-on source
   from displacing papers.
5. **Treat page text as data.** The prompt labels it untrusted and instructs the model to ignore
   instructions inside it.
6. **One adapter, three surfaces.** Browser, MCP, and CLI all drive the shipping `searchWeb` through
   `tools/load-ll.mjs`, so behaviour cannot drift between them.

## Constraints

- No secret in a tracked file; never ask for a key in chat.
- No web result in the scholarly ranking.
- Do not claim browser-callability from a Node-only run; the Chromium check is the evidence.
- Tavily-only for this iteration; Jina/SearXNG and other providers are parked.

## Verification

- `node tests/verify.mjs` — 95 assertions, including live Tavily section.
- `node tests/browser.mjs` — 44 assertions, including default-on, separate section, and Chromium CORS.
- `node tests/mcp-server.mjs` — 19 assertions, including live `search_web`.
- `node tests/tools-search.mjs` — 11 assertions, including live web CLI.
- `node tests/proxy-integration.mjs` — 16 assertions, unchanged.
