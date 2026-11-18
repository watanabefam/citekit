# CLI and MCP Output Contracts

Informative integration contract snapshot, checked 2026-11-17. Existing tool names and required inputs remain stable.

## Shared adapters

- `LL.searchOpenAIRE(query, options)` and `LL.searchClinicalTrials(query, options)` are the sole implementations in the shipping `index.html` script.
- `tools/load-ll.mjs` exposes them to CLI, MCP, and headless tests.

## CLI

- `--sources` accepts `openaire` and `clinicaltrials`, both explicit opt-in and excluded from default source list.
- Existing output paper/web records retain shape. Trial records appear in a separate `trials` collection per query and a separate “Registered studies” Markdown section.
- Do not pass trials through paper dedupe, OpenAlex enrichment, ranking, citation expansion, DOI retraction/critique checks, or paper citation formatting.
- Errors identify the source while preserving successful records.

## MCP

- Keep tool `search_literature` and current required input `query` unchanged.
- Add source enum choices `openaire` and `clinicaltrials` to optional `sources`; neither is in the default `KEYLESS` list.
- Keep `records` as scholarly results. Add `trials` as a separate array; when unselected, it is empty. `total` counts scholarly records only; optionally expose `trialTotal` if useful, and document semantics.
- Every trial item has `kind: "trial"`, `nctId`, exact status, source, and URL. Do not trim those required fields.
- Tool description/instructions clearly distinguish registered studies from scholarly publications and make no efficacy implication.
