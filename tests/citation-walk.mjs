#!/usr/bin/env node
// Citation-graph walking, verified with a stubbed OpenAlex — deterministic, no network.
// Asserts the properties that matter: provenance labels, DOI seeding, the seed cap, the
// big-page rule (a page of 200 costs the same as a page of 1, so small pages are waste),
// graceful skipping of un-seedable records, and standard record shape.
import { loadLL } from '../tools/load-ll.mjs';

const work = (id, title, extra = {}) => ({
  id: 'https://openalex.org/' + id, display_name: title, publication_year: 2020,
  authorships: [{ author: { display_name: 'A Author' } }], primary_location: { source: { display_name: 'J Test' } },
  open_access: { is_oa: true, oa_status: 'gold' }, best_oa_location: { pdf_url: 'https://x/y.pdf' },
  cited_by_count: 7, abstract_inverted_index: null, is_retracted: false, doi: 'https://doi.org/10.1/' + id,
  ...extra
});

const calls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  const body = { meta: {} };
  if (/\/works\/W\d+\?/.test(u)) body.referenced_works = ['https://openalex.org/W9001', 'https://openalex.org/W9002'];
  else if (/filter=cites/.test(u)) body.results = [work('W7001', 'Forward: cites the seed')];
  else if (/openalex_id/.test(u)) body.results = [work('W9001', 'Backward: the seed cites this')];
  else if (/filter=doi/.test(u)) body.results = [{ id: 'https://openalex.org/W5001', doi: 'https://doi.org/10.5555/abc' }];
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

const LL = await loadLL();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n + (x ? ' — ' + x : ''))) : (fail++, console.log('  ✗ ' + n + ' — ' + x)); };

console.log('\nCitation-graph walking (stubbed OpenAlex, no network)');

const seeds = [
  { id: 'openalex:W1111', title: 'Seed A with an OpenAlex id', doi: '' },
  { id: 'crossref:x', title: 'Seed B DOI-only (needs the DOI lookup)', doi: '10.5555/abc' },
  { id: 'eric:99', title: 'Seed C has neither id nor DOI', doi: '' },
];
const out = await LL.expandCitations(seeds, { maxSeeds: 5 });

ok('returns records from both directions', out.length >= 2, out.length + ' records');
const fwd = out.filter(r => r.via === 'cites-seed');
const bwd = out.filter(r => r.via === 'cited-by-seed');
ok('forward records are labelled "cites-seed" with their seed', fwd.length > 0 && fwd[0].viaSeed.includes('Seed A'), fwd[0] ? fwd[0].viaSeed.slice(0, 30) : 'none');
ok('backward records are labelled "cited-by-seed" with their seed', bwd.length > 0 && bwd[0].viaSeed.length > 0, bwd[0] ? bwd[0].viaSeed.slice(0, 30) : 'none');
ok('a DOI-only seed is resolved through the batched DOI filter', calls.some(c => /filter=doi/.test(c)), 'doi filter called');
ok('a seed with neither id nor DOI is skipped, not fatal', out.every(r => !/Seed C/.test(r.viaSeed || '')), 'no Seed C records');

const firstRun = [...calls];                       // the maxSeeds call below reuses the same log
const citeCalls = firstRun.filter(c => /filter=cites/.test(c));
ok('one forward call per RESOLVABLE seed (Seed A by id, Seed B via DOI) = 2',
   citeCalls.length === 2, citeCalls.length + ' forward calls');
calls.length = 0;
await LL.expandCitations(seeds, { maxSeeds: 1 });
const cappedForwards = calls.filter(c => /filter=cites/.test(c)).length;
ok('the seed cap is enforced', cappedForwards <= 1, cappedForwards + ' forward calls at maxSeeds=1');

const perMatch = citeCalls[0] && /per-page=200/.test(decodeURIComponent(citeCalls[0]));
ok('forward asks for a page of 200 (page size is free, so small pages are waste)', !!perMatch, citeCalls[0] ? decodeURIComponent(citeCalls[0]).match(/per-page=\d+/)[0] : 'no call');
ok('backward hydration batches through openalex_id', calls.some(c => /openalex_id/.test(c)), 'batched');
ok('the free referenced_works lookup is used for backward', calls.some(c => /\/works\/W\d+\?/.test(c)), 'lookup made');

const shape = out[0];
ok('records match the standard source shape', ['id', 'title', 'authors', 'year', 'venue', 'source', 'oa'].every(k => k in shape), Object.keys(shape).slice(0, 6).join(','));
ok('provenance does not clobber the record id', out.every(r => typeof r.id === 'string' && r.id.includes(':')), shape.id);

console.log(`\n=== citation walk: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
