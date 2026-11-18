# Data Model: OpenAIRE and ClinicalTrials.gov Sources

**Status:** Informative design companion to [spec.md](spec.md); behavior requirements in the spec prevail.

## ScholarlyRecord (existing, additive fields)

Existing fields remain: `id`, `title`, `authors[]`, `year`, `venue`, `doi`, `url`, `pdf`, `abstract`, `citations`, `source`, `oa`, plus existing optional flags and ranking metadata.

Optional additive OpenAIRE fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `openAireId` | string | OpenAIRE Graph research-product ID |
| `openAirePids` | `{scheme: string, value: string}[]` | Provided persistent identifiers, including DOI when present |
| `openAireAttribution` | string | `OpenAIRE Graph` attribution/source marker |
| `peerReviewStatus` | `peer-reviewed \| not-peer-reviewed \| mixed \| unknown` | Derived conservatively from non-empty `instances[].refereed` values |
| `peerReviewed` | boolean, optional | Backward-compatible UI flag, true only when supported by the aggregation rule; never true for mixed/unknown |
| `oaStatus` | string, optional | CiteKit's existing access-status display field; preserve provider label where mapping is safe |

**Peer review aggregation rule:** collect recognized instance values. Only `peerReviewed` → `peer-reviewed`; only `nonPeerReviewed` → `not-peer-reviewed`; both → `mixed`; no recognized values or unrecognized-only values → `unknown`. Do not use majority vote, first instance, or OpenAIRE entity type as a substitute.

**Record URL:** use `https://doi.org/{normalized DOI}` when a valid DOI exists; else select a stable HTTP(S) URL from the instances when possible; otherwise use OpenAIRE product identifier/record link if supplied. Never synthesize an unusable DOI.

## TrialRecord (new)

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | CiteKit stable ID, `clinicaltrials:{NCTId}` |
| `kind` | literal `trial` | yes | Keeps this record outside paper and web categories |
| `nctId` | string | yes | Registry identifier, normally `NCT` plus digits |
| `title` | string | yes | Study brief title |
| `abstract` | string | no | Brief summary; plain text after safe normalization |
| `status` | string | yes | Exact API `overallStatus`; preserve unknown values |
| `studyType` | string | no | API `studyType` |
| `phases` | string[] | no | API phase values; omit `NA` sentinel from display while retaining raw only if useful |
| `url` | string | yes | Canonical `https://clinicaltrials.gov/study/{NCTId}` |
| `source` | literal `ClinicalTrials.gov` | yes | Explicit registry provenance |
| `retrievedAt` | ISO timestamp | no | Optional retrieval timestamp; not an evidence or update date |

Do not add a DOI, paper citation count, scholarly `_rank`, or peer-review boolean to TrialRecord. Registry records may describe completed studies without posted results.

## SearchRun

Existing run data is extended with an independently settled trial list and source errors:

- `RESULTS`: scholarly records only
- `TRIAL_RESULTS`: trial records only
- `WEB_RESULTS`: web pages only
- `errors`: per-source failures retained as displayable diagnostics

CLI/MCP JSON preserves existing `records` and adds `trials`; trials remain identifiable even where consumers flatten results. Cache keys must incorporate requested sources and no cached response may be reused when the source selection differs.
