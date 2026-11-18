# ClinicalTrials.gov API v2 Contract

Informative external API contract snapshot, checked 2026-11-17. The feature spec remains authoritative for product behavior.

## Request

- Method: `GET`
- URL: `https://clinicaltrials.gov/api/v2/studies`
- Query parameters:
  - `query.term=<encoded user query>`
  - `pageSize=<bounded integer: caller default 10 in tools, cap 20>`
  - `format=json`
  - Request only used field groups if sparse field selection proves stable and helpful; not required for MVP.
- No credentials or model key.
- First page only; `nextPageToken` pagination is deferred.

## Expected Response

JSON object with `totalCount`, `studies[]`, optional `nextPageToken`. Each study contains a `protocolSection` with relevant modules:

- `identificationModule.nctId`, `briefTitle`
- `statusModule.overallStatus`
- `descriptionModule.briefSummary` (optional)
- `designModule.studyType`, `phases[]` (optional)

## Validation and Mapping

- Reject non-2xx, invalid JSON, or top-level response lacking `studies` array.
- Skip items without `protocolSection.identificationModule.nctId` or nonempty brief title.
- Keep status raw and visible; unknown future status strings must not be coerced into known states.
- Omit empty/`NA` phase labels; preserve meaningful supplied phases.
- Construct canonical link as `https://clinicaltrials.gov/study/${encodeURIComponent(nctId)}` after validating NCT ID.
- Tag all outputs `kind: "trial"`, `source: "ClinicalTrials.gov"`; no ranking/dedupe with papers.
- Display that registration/status is not evidence of efficacy or results.
