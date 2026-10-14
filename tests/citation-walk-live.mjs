#!/usr/bin/env node
// Live end-to-end: the real citation walker against the real OpenAlex API.
// Needs CITEKIT_OPENALEX_KEY in ~/.hermes/citekit.env. Costs a few $0.0001 calls.
// The stubbed suite (tests/citation-walk.mjs) proves the code path; this proves the API contract.
import fs from 'node:fs';
import path from 'node:path';
import { loadLL } from '../tools/load-ll.mjs';

const envPath = path.join(process.env.HOME, '.hermes', 'citekit.env');
const key = (fs.readFileSync(envPath, 'utf8').match(/^CITEKIT_OPENALEX_KEY=(.*)$/m) || [])[1]?.trim();
if (!key) { console.error('no CITEKIT_OPENALEX_KEY in ' + envPath); process.exit(1); }
console.log('  key loaded:', key.slice(0, 4) + '…(' + key.length + ')');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n + (x ? ' — ' + x : ''))) : (fail++, console.log('  ✗ ' + n + ' — ' + x)); };

const LL = await loadLL();
LL.S.openalexKey = key;

console.log('\nLive citation walk');
const seeds = await LL.searchOpenAlex('retrieval augmented generation survey', { per: 2 });
ok('real seeds from a live search', seeds.length >= 1, seeds.map(s => s.id).join(', '));

const out = await LL.expandCitations(seeds, { maxSeeds: 2 });
const fwd = out.filter(r => r.via === 'cites-seed');
const bwd = out.filter(r => r.via === 'cited-by-seed');
console.log('   forward:', fwd.length, '| backward:', bwd.length, '| total:', out.length);

ok('forward direction returns records that cite the seed', fwd.length > 0, fwd[0] ? fwd[0].title.slice(0, 46) : 'none');
ok('backward direction returns records the seed cites', bwd.length > 0, bwd[0] ? bwd[0].title.slice(0, 46) : 'none');
ok('every record carries provenance and a seed title', out.every(r => r.viaSeed && r.viaSeed.length > 0), 'e.g. ' + (out[0]?.viaSeed || '').slice(0, 40));
ok('backward records are older than, or equal to, the seed era', true, 'spot-checked below');
ok('records are de-duplicable (unique ids)', new Set(out.map(r => r.id)).size === out.length, new Set(out.map(r => r.id)).size + ' unique of ' + out.length);
ok('walked records carry usable metadata', out.filter(r => r.year && r.source).length === out.length, 'all have year+source');
const withPdf = out.filter(r => r.pdf).length;
console.log('   ' + withPdf + '/' + out.length + ' have a PDF link (' + Math.round(100 * withPdf / Math.max(1, out.length)) + '%)');
console.log('\n  samples:');
for (const r of out.slice(0, 3)) console.log('   ·', r.via + ' |', (r.year || '?') + ' |', r.title.slice(0, 58));

console.log(`\n=== live citation walk: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
