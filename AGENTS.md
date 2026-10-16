# CiteKit

Agent instructions for this repository. Read before making any change.

## What this is

A single-file, no-backend BYOK academic research workspace: nine scholarly sources, deterministic
ranking, citation-grounded answers through the user's own model key. `index.html` is the whole app —
no build step, no bundler, no dependencies.

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
node tools/search.mjs                  # headless search over the adapters (full records, no browser)
```

Every test loads `index.html`, extracts its `<script>`, and runs it against a DOM stub.
`tools/load-ll.mjs` factors that harness out for scripts under `tools/`. If you change the globals
`index.html` exposes, change the harness in one place. `tests/screenshots/` is gitignored output.

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
  user. Never write one into a file here, never ask for one in chat, never type one into a page.
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
index.html              the entire app (UI, adapters, ranking, BYOK adapters, citations)
proxy/worker.js         hardened Cloudflare Worker unlocking the two no-CORS APIs
tests/                  verification scripts — re-runnable, none mocked at the HTTP layer
tools/                  load-ll.mjs (shared DOM-stub harness), search.mjs (headless CLI)
skills/evidence-search/ portable Agent Skills — installed (symlinked into the host skills dir); validated: compliance on 3 pressure topics + trigger eval clean. Protocol + harness: validation-protocol.md, validation/
README.md               the teardown, measured tables, and known-gaps list
```
