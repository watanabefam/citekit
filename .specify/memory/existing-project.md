# Existing-Project Inspection

CiteKit — a single-file, no-backend, BYOK academic research workspace (nine scholarly sources,
deterministic ranking, citation-grounded answers through the user's own model key). Grounded in the
repository as committed at inspection time.

## Repository Structure
- `index.html` — the entire application (1266 lines): UI, source adapters, dedupe, ranking, BYOK LLM
  adapters, prompt building, library, export. No build step.
- `proxy/` — `worker.js` (Cloudflare Worker CORS passthrough) and `wrangler.toml`.
- `tools/` — `load-ll.mjs` (shared DOM-stub harness), `search.mjs` (headless CLI), `mcp-server.mjs` (MCP stdio server).
- `tests/` — re-runnable `.mjs` verification scripts, `queries.json`, `judgments.json`, `screenshots/` (gitignored).
- `skills/evidence-search/` — a portable Agent Skill (`SKILL.md`, `references/scholarly-apis.md`, `validation/`).
- Docs: `README.md` (teardown, measured tables, known gaps), `AGENTS.md`, `CLAUDE.md` (imports AGENTS.md), `.hermes.md` (points to AGENTS.md), `LICENSE` (MIT).
- No `package.json`, no `node_modules`, no bundler, no CI config (`.github/` absent).

## Application Entry Points
- Browser app: `index.html`, served over `http://` via `python3 -m http.server 8777` (an http origin is required for the optional proxy).
- `window.LL` (`index.html:1260`) — the globals the app exposes to tests and tools.
- CLI: `node tools/search.mjs "<query>"`.
- MCP: `node tools/mcp-server.mjs` (stdio JSON-RPC 2.0, Node 18+ for global `fetch`).
- Proxy: `proxy/worker.js`, deployed with `wrangler deploy`; local dev with `wrangler dev`.

## Relevant Components
- Nine source adapters: `searchOpenAlex`, `searchCrossref`, `searchEPMC`, `searchPubMed`, `searchERIC`, `searchDOAJ`, `searchCORE`, `searchS2`, `searchArxiv`.
- `dedupe` (DOI → title-normalised merge, provenance kept per record); `checkShape` (response-shape validation).
- `enrichWithOpenAlex`, `expandCitations` (one level, both directions), `openAlexToRecord`, `openAlexIdsFor`.
- Deterministic ranking: `rankScore` / `rankResults` (four signals: lexical 1.0, citations 0.30, full-text 0.45, OA 0.15); `scorePage`; `buildContext`.
- BYOK LLM adapters via `callLLM`: OpenAI-compatible, Anthropic Messages, Gemini SSE — all browser-direct.
- Library in `localStorage`; `exportLibrary` to BibTeX / RIS / CSL-JSON / APA.
- `viaProxy` — routes Semantic Scholar / arXiv through the Worker.
- MCP tools: `search_literature`, `expand_citations`, `get_record`.

## Test Strategy
- `node tests/verify.mjs` — 87 behavioural assertions; logic plus **live** upstream APIs and fake SSE.
- `node tests/browser.mjs` — 40 assertions driving real Chromium (needs the server); includes 15 accessibility assertions and writes `tests/screenshots/`.
- `node tests/proxy-integration.mjs` — 16 assertions against the real workerd runtime (needs `cd proxy && wrangler dev --port 8788`).
- `node tests/mcp-server.mjs` — 17 assertions speaking the real MCP protocol over stdio.
- `node tests/citation-walk.mjs` (12, no network) and `citation-walk-live.mjs` (7, live with a key).
- `node tests/eval-ranking.mjs` — IR evaluation (depth-k pooling, graded 0–3, nDCG@8 primary, bpref, P@5/P@8, train/test query split); hand judgments in `judgments.json`; optional BYOK model judge.
- `tests/rank-value.mjs`, `source-value.mjs`, `pool-depth.mjs`, `tools-search.mjs` — value/smoke scripts.
- Common technique: every test loads `index.html`, extracts its `<script>`, and runs it under a DOM stub; `tools/load-ll.mjs` factors this out.
- No test runner / CI; scripts are run directly with `node`.

## Build and Deployment
- No build step, bundler, or dependencies — serve `index.html` statically.
- Proxy: `wrangler deploy`; local `wrangler dev`; secrets via `wrangler secret put S2_KEY|CORE_KEY|PROXY_KEY`.
- MCP server is spawned by an MCP client (`command: node`, keys passed in `env`).
- CI/CD pipeline: unknown — no evidence found (no `.github/`, no package scripts).

## Coding Conventions
- Single-file app; Node scripts are ES modules (`.mjs`) using stdlib and global `fetch`.
- Comments explain *why* (bug history, measured rationale), not *what*.
- Node tools write diagnostics to stderr; stdout carries protocol/output only.
- When `index.html` globals change, the DOM-stub harness (`tools/load-ll.mjs`) is updated in one place.
- `.hermes.md` and `CLAUDE.md` defer to `AGENTS.md`; do not duplicate rules.

## Data Stores and Migrations
- Browser `localStorage` — the library and settings, including user API keys (`ll.*` legacy keys, ~5 MB limit).
- `tests/judgments.model.json` — cached model verdicts written by `--judge-model` (may be absent).
- No server-side database and no migrations.

## External Services
- Bibliographic: OpenAlex (metered, primary, CORS-open), Crossref, Europe PMC, PubMed (NCBI E-utilities), ERIC, DOAJ, CORE (key required in practice), Semantic Scholar (key recommended; no CORS), arXiv (no CORS).
- LLM providers (BYOK): OpenRouter, OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, DeepSeek, Groq…).
- Cloudflare Workers (proxy), including the local `workerd` runtime.
- No general web-search provider is included.

## Security and Access Controls
- No secrets in the repository; keys are user-entered into browser `localStorage`, or held as Worker secrets. `.gitignore` blocks `.env`, `*.dev.vars`, etc.
- Proxy controls: target allowlist (the real boundary), origin allowlist, optional `X-Proxy-Key` shared secret, no unconditional `Origin` reflection, stripped cookies/`Origin`/`Referer`/CF-* and `Set-Cookie`, preflight answered at the edge (204).
- MCP keys are passed via environment, not command-line arguments.
- Stated limitation: a browser-called proxy cannot keep a secret; the target allowlist is the boundary.

## Observability
- Proxy: `[observability] enabled = true` in `wrangler.toml`; `X-Proxy-Cache` HIT/MISS headers; cache-put failures logged to console.
- Node tools/tests emit diagnostics to stderr; the test suites are the primary behavioural observability.
- No application-level logging, metrics, or telemetry framework — unknown, no evidence found.

## Known Constraints
- Single-user, no sync; library capped by `localStorage` (~5 MB); full-text PDFs will fill it.
- OpenAlex is metered ($0.001/call; $1/day with a key, small anonymous budget) — "don't loop it".
- Semantic Scholar and CORE need free keys in practice (429 otherwise).
- ERIC full text is per-record (some `files.eric.ed.gov` links 404).
- Proxy cannot reach private/localhost addresses, so local LLMs are browser-direct only.
- Ranking weights are directions, not validated constants (tuned on two queries); the evaluation is under-powered (12 queries) and the rubric judge was lenient.
- No PDF annotation layer, no document writer, no web/Google mode.

## Existing Behaviour That Must Remain Unchanged
- The `window.LL` global and the `ll.*` `localStorage` keys are deliberately legacy names — renaming them would orphan saved libraries and churn every test.
- Tests run `index.html`'s real shipping `<script>` under a DOM stub; keep `tools/load-ll.mjs` in sync rather than reimplementing the pipeline.
- Deterministic ranking (no embeddings by default); citation numbers assigned before the model runs; cross-source consensus and recency deliberately excluded from the score (a regression test asserts consensus does not affect ranking).
- Citation semantics `[n]` / `[n, p.4]` and the source list rendered from the same array as the prompt blocks.
- Proxy contract: edge preflight, allowlists, header stripping, `Vary: Origin`, and page-of-200 citation fetches.
- MCP tool names/schemas and the rule that a notification is never answered.
- A user key never leaves the browser except to the chosen provider.

## Spec Kit Adoption Notes
- Spec Kit has just been installed: `.specify/` exists (memory, templates, presets, scripts), along with `.opencode/commands/speckit*.md` and `.opencode/hook/hooks.yaml`. No `specs/` directory yet.
- Generated, not hand-edited: `.opencode/commands/speckit*.md`, `.specify/scripts/`, `.specify/templates/`, `.specify/presets/`. Editable: `.specify/memory/constitution.md`, `specs/`.
- Hooks (require the `opencode-yaml-hooks` plugin): block `git commit --no-verify` and equivalent hook bypasses; block edits to the generated paths above.
- There is no `package.json` or CI, so new specs must define their own verification command (a `node tests/*.mjs` script or direct probe).
- `AGENTS.md` rule: never state a metric that has not been run — re-run the relevant script before touching README prose.
