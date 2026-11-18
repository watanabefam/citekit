# CiteKit

Agent instructions for this repository. Read before making any change.

## What this is

A single-file, no-backend BYOK academic research workspace: ten scholarly sources, a separate
ClinicalTrials.gov registry lane, a Tavily-backed web source, deterministic ranking, and
citation-grounded answers through the user's own model key.
`index.html` is the whole app — no build step, no bundler, no dependencies. Web search is on by
default, runs in a separate lane, and is always labelled not peer-reviewed.

It is a self-contained replacement for the commercial AI research assistants. `README.md` holds the
teardown, the measured tables, and the honest gap list.

## Commands

```bash
python3 -m http.server 8777 &          # serve the app (the browser tests need this)
node tests/verify.mjs                  # headless assertions: logic + LIVE upstream APIs
node tests/browser.mjs                 # Chromium pass + screenshots (needs the server)
node tests/proxy-integration.mjs       # worker assertions (needs: cd proxy && wrangler dev --port 8788)
node tests/eval-ranking.mjs            # nDCG@8 / P@k over pooled, graded judgments
node tests/source-value.mjs            # per-source marginal value + open-access coverage
node tests/rank-value.mjs "query"      # old-vs-new ranking comparison on live data
node tests/mcp-server.mjs              # MCP protocol + live tools
node tests/tools-search.mjs            # CLI contract + live web path
node tools/search.mjs                  # headless search over the adapters (full records, no browser)
node tools/search.mjs "q" --sources web # Tavily web search (keyless by default)
```

The headless and CLI tests load `index.html`, extract its `<script>`, and run it against a DOM stub;
the MCP test spawns the real server, and the proxy test runs the real worker. `tools/load-ll.mjs`
factors the harness out for scripts under `tools/`. If you change the globals `index.html` exposes,
change the harness in one place. `tests/screenshots/` is gitignored output.

## Rules

- **Never state a metric you have not run.** Every number in `README.md` came from a probe or a test.
  If you change behaviour, re-run the relevant script *before* touching the prose.
- **Vary the one variable you believe is responsible before naming a cause, then repeat it.** Twice in
  this repo's history a plausible mechanism was wrong — "cross-source consensus is a quality signal"
  and "CORE's 429 is triggered by the browser `Origin` header" — and each wrong version had to be
  unwound from code comments *and* the README. A wrong mechanism outlives the puzzle it came from.
- **A green headless run is not browser-callability.** Node sends no `Origin` and draws on no browser
  quota, so an endpoint the tests reach happily can still fail in the page.
- **No secrets in this repository.** API keys live in the browser's `localStorage`, entered by the
  user; in the process environment for tools; or in a `0600` file under `~/.config/citekit/`.
  Never write one into a file here, never ask for one in chat, never type one into a page. The MCP
  server's fallback path and `.gitignore`'s `*.key` pattern exist so a key cannot be committed by
  accident — both must stay in place.
- **Web results are untrusted and separate.** They never enter the scholarly ranking, are never
  merged with a paper by title, and are labelled not peer-reviewed in the UI and the prompt. Keyless
  Tavily is rate-limited; the free key is the escape hatch.
- **The ranking weights are directions, not validated constants.** They were tuned on two queries, and
  the evaluation judge is a rubric that currently grades ~98% of pooled documents as relevant, so it
  cannot separate close variants. Say so rather than implying the tuning is settled.
- **A test that fails intermittently is a product bug until proven otherwise.** The worker's edge
  cache "flakiness" was a real defect: upstream `Age` headers made workerd refuse to store the
  response. Diagnose before dismissing.
- **The `ll.*` localStorage keys and the `window.LL` global are legacy names**, kept because renaming
  them would orphan saved libraries and churn every test. Leave them.

## Layout

```
index.html              the entire app (UI, scholarly + Tavily web adapters, ranking, BYOK, citations)
proxy/worker.js         hardened Cloudflare Worker unlocking the two no-CORS scholarly APIs
tests/                  verification scripts — re-runnable, none mocked at the HTTP layer
tools/                  load-ll.mjs (shared harness), search.mjs (CLI), mcp-server.mjs (MCP)
skills/evidence-search/ portable Agent Skills — installed (symlinked into the host skills dir); validated: compliance on 3 pressure topics + trigger eval clean. Protocol + harness: validation-protocol.md, validation/
README.md               the teardown, measured tables, and known-gaps list
```

## MCP tool discovery and key custody

### Finding the tools

The server is registered in the host as **`CiteKit`**, exposing four tools: `search_web`,
`search_literature`, `expand_citations`, `get_record`.

**Search for it by name, not by intent.** Measured 2026-11-11 in Freebuff: the queries
`citekit citation DOI verify` and `citation DOI reference verify` returned **zero** servers, while
`CiteKit` and `search_literature` each returned all four tools. The host's tool-search index keys on
server and tool names, so a prose question about what the tools *do* reliably misses them. That is an
argument-shape bug, not a broken server — do not go hunting config first.

If a name search also returns nothing, verify the server independently before touching any config:

```bash
node tests/mcp-server.mjs     # 20 assertions, spawns the real server over stdio
```

### Where the keys live — never in this repo

Every key is read **environment first**, then from a `0600` file under `~/.config/citekit/`. Point
any key at a different file with `CITEKIT_<NAME>_KEY_FILE` (e.g. `CITEKIT_S2_KEY_FILE`).

**The key directory is `~/.config/citekit/`** — run `ls ~/.config/citekit/` to see which key files
exist (snapshot 2026-11-18: `core.key`, `openalex.key`, `tavily.key`; no `s2.key`). The directory
holds keys only and sits outside this repo.

**Tavily's key file is `~/.config/citekit/tavily.key`.** The MCP server (`tools/mcp-server.mjs`)
reads it automatically. The CLI (`tools/search.mjs`) does **not** — it resolves only `--tavily-key`,
`CITEKIT_TAVILY_KEY`, then `TAVILY_API_KEY`, and silently falls back to keyless mode when all three
are absent. For a keyed CLI search:

```bash
node tools/search.mjs "q" --sources web --tavily-key "$(cat ~/.config/citekit/tavily.key)"
```

| Key | Environment | File | Effect |
|---|---|---|---|
| OpenAlex | `CITEKIT_OPENALEX_KEY` | `openalex.key` | raises the budget from $0.10/day to $1/day |
| Semantic Scholar | `CITEKIT_S2_KEY` | `s2.key` | lifts the shared-pool 429 |
| CORE | `CITEKIT_CORE_KEY` | `core.key` | lifts the anonymous quota |
| Tavily | `CITEKIT_TAVILY_KEY` / `TAVILY_API_KEY` | `tavily.key` | raises the web-search limit |

All four are optional; the six keyless scholarly sources work with none of them. Write a key file
without printing its value:

```bash
umask 077; mkdir -p ~/.config/citekit
printf '%s' "$YOUR_KEY" > ~/.config/citekit/s2.key && chmod 600 ~/.config/citekit/s2.key
```

Never add a key to `~/.freebuff/mcp.json`, a committed `.env`, or a shell command that lands in
history. The environment block in a client config is fine at runtime, but clients rewrite that file
and can drop the block — which is why the file fallback exists.

<!-- SPECKIT-BRIDGE START -->
# Spec-Driven Development (Spec Kit)

This project uses Spec Kit. Requirements are written down before code is written, and the
artifacts under `specs/` are the source of truth.

**First act of any session in this project: check the workflow before acting.** If the request
is software work, `spec-driven-development` applies — do not improvise from memory. Prefer
`.opencode/commands/speckit.md` (the `/speckit` entry point): it classifies the request, picks the
smallest workflow that fits, and routes. You are not exempt because the task looks simple.

**Load the `spec-driven-development` skill before specifying, planning, or implementing.**
It carries the workflow, approval gates, traceability and verification rules.

**The skill loads on roughly 60% of relevant requests — `/speckit` is the reliable path.** Invoke
it when you need the workflow to apply for certain.

**End every response with the four-bucket handoff** — Done (with evidence) · Continuing · Decision
needed · Approval required — defined in `.opencode/autonomy-contract.md`. Reversible, in-scope work
is autonomous; only the irreversible, external, or costly needs approval.

## Two rules that are enforced, not advised

`.opencode/hook/hooks.yaml` (requires the `opencode-yaml-hooks` plugin) runs below the prompt layer,
so unlike everything above it cannot be talked out of:

- **`git commit --no-verify` is blocked.** Do not try to skip the project's checks, and do not route
  around this with an equivalent — fix what the check is complaining about, or run the check
  directly to see the failure.
- **Generated files are not hand-edited.** `.opencode/commands/speckit*.md`, `.specify/scripts/`,
  `.specify/templates/` and `.specify/presets/` are regenerated and an edit there is lost. Change
  the kit instead. `.specify/memory/constitution.md` and `specs/` are yours to edit.

## If you cannot invoke `/speckit.*` commands

Agents that do not read `.opencode/commands/` (e.g. Freebuff/Codebuff) can run each step by
reading the command prompt directly and following it as instructions:

| Step | File |
| --- | --- |
| entry point | `.opencode/commands/speckit.md` |
| fast lane (small work) | `.opencode/commands/speckit.quick.md` |
| constitution | `.opencode/commands/speckit.constitution.md` |
| specify | `.opencode/commands/speckit.specify.md` |
| plan | `.opencode/commands/speckit.plan.md` |
| tasks | `.opencode/commands/speckit.tasks.md` |
| implement | `.opencode/commands/speckit.implement.md` |
| converge | `.opencode/commands/speckit.converge.md` |
| clarify | `.opencode/commands/speckit.clarify.md` |
| analyze | `.opencode/commands/speckit.analyze.md` |
| checklist | `.opencode/commands/speckit.checklist.md` |

Substitute the user's feature description wherever the prompt expects `$ARGUMENTS`.
<!-- SPECKIT-BRIDGE END -->
<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/001-web-search-source/plan.md
<!-- SPECKIT END -->

<!-- SPECKIT-COMMANDS START -->
## Commands

Detected for this project by `speckit-init`. Run `./scripts/verify` for test → lint → typecheck.

| Purpose | Command |
| --- | --- |
| install | unresolved — set by hand, or re-run `speckit-init` after adding a manifest |
| test | unresolved — set by hand, or re-run `speckit-init` after adding a manifest |
| lint | unresolved — set by hand, or re-run `speckit-init` after adding a manifest |
| typecheck | unresolved — set by hand, or re-run `speckit-init` after adding a manifest |
| build | unresolved — set by hand, or re-run `speckit-init` after adding a manifest |
<!-- SPECKIT-COMMANDS END -->
