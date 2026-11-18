# OpenAIRE Graph v4 Contract

Informative external API contract snapshot, checked 2026-11-17. The feature spec remains authoritative for product behavior.

## Request

- Method: `GET`
- URL: `https://api.openaire.eu/graph/v4/research-products`
- Query parameters:
  - `search=<encoded user query>`
  - `filter=type:publication`
  - `page=1`
  - `page_size=<bounded integer: caller default 10 in tools, cap 25>`
- Do not request a token or include user model credentials.
- One bounded page only; no pagination in this version.

## Expected Response

JSON object:

- `header`: object with `numFound`, `page`, `pageSize` and optional query metadata.
- `results`: array of research-product entities.
- Product fields may include `id`, `mainTitle`, `publicationDate`, `authors`, `pids`, `descriptions`, `container`, `bestAccessRight`, `instances`, `links`, and indicators. Fields can be absent/null.
- `instances[]` may expose `refereed` values including `peerReviewed` and `nonPeerReviewed`, plus `urls`, access/license, identifiers, source and host provenance.

## Validation and Mapping

- Reject non-2xx, invalid JSON, or top-level response lacking `results` array and `header` object.
- Skip unusable records without a title; preserve optional fields without invention.
- Normalize DOI PID; preserve original OpenAIRE ID and PID set.
- Remove HTML/XML markup from descriptions before safe text display.
- Determine review status from recognized instance flags only, using `data-model.md` aggregation.
- Use canonical DOI URL where possible; else a safe instance URL.
- Carry `OpenAIRE Graph` attribution on each record and in UI documentation.
