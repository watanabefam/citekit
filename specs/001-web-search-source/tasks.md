# Tasks: Web Search Source

**Feature**: `001-web-search-source` · **Plan**: [plan.md](plan.md) · **Spec**: [spec.md](spec.md)

All tasks completed 2026-10-20. Evidence is the test command named beside each group.

## Phase 1 — Provider and adapter

- [x] T001 Verify Tavily is browser-callable with no key: keyless `POST /search` returned HTTP 200
      and CORS headers in real Chromium. (Evidence: 2026-10-20 browser probe.)
- [x] T002 Add `searchWeb()` to `index.html`: keyless header or Bearer key, timeout, normalized
      records (`title`, `url`, `host`, `text`, `retrieved`), and `webError`.
- [x] T003 Add `canonicalUrl()`, `dedupeWeb()`, `rankWebResults()`, `WEB_TEXT_CAP = 6000`, and
      `WEB_RESULTS` state.
- [x] T004 Export the web helpers on `window.LL` for the shared Node harness.

## Phase 2 — Browser integration

- [x] T005 Add the `#src-web` checkbox, checked by default.
- [x] T006 Run web in a parallel lane while scholarly sources load; do not let a web failure fail
      the paper search.
- [x] T007 Render a separate `.websec` with `.card.web`; label every result **web page
      (not peer-reviewed)** and show host, date, and Add-to-library.
- [x] T008 Include web slots in `buildContext()`, capped at half the context.
- [x] T009 Add untrusted-web rules and a separate web block to the answer prompt.
- [x] T010 Show the web source in the source table and context info.
- [x] T011 Add Settings fields `webProvider` and `tavilyKey`; the key stays in `localStorage` and is
      sent only to Tavily.

## Phase 3 — MCP server

- [x] T012 Add `search_web` with `query`, `max_results`, `domains`, and `time_range`.
- [x] T013 Read the key from `TAVILY_API_KEY` or `CITEKIT_TAVILY_KEY`; work keyless when absent.
- [x] T014 Add `trimWeb()` so tool responses respect the text cap.
- [x] T015 Bump the server to 1.1.0 and update the instructions to describe the separate web lane.
- [x] T016 Register the local server in the OpenCode global config as `citekit` (no key stored).

## Phase 4 — CLI

- [x] T017 Add `--sources web`, `--tavily-key`, `--web-key`, `--web-domains`, and `--web-time`.
- [x] T018 Rank/dedupe web separately from papers and keep the existing full-record output.
- [x] T019 List `web` in `--list-sources`.

## Phase 5 — Verification and docs

- [x] T020 Extend `tests/verify.mjs` with a live web section (assertions: 87 → 95).
- [x] T021 Extend `tests/browser.mjs`: 10 checkboxes, default-on, separate section, Chromium CORS
      (assertions: 40 → 44).
- [x] T022 Extend `tests/mcp-server.mjs`: four tools and a live `search_web` call (17 → 19).
- [x] T023 Add `tests/tools-search.mjs` web coverage (11 assertions).
- [x] T024 Update `README.md`: intro, counts, provider table, MCP tools, CLI flags, architecture,
      web section, known gaps, and next steps.
- [x] T025 Update `AGENTS.md` with the web lane, CLI/MCP commands, and the untrusted/separate rule.
- [x] T026 Record the technical baseline in `plan.md` and this task list.

## Deferred

- [ ] Measure median added latency for the web lane.
- [ ] Add Jina Search or self-hosted SearXNG as a fallback.
- [ ] Add Google/Bing/Brave/Serper adapters.
