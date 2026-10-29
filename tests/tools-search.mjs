// Smoke-test for tools/search.mjs — the headless CLI.
// Runs the CLI as a subprocess (real argv handling) and checks the contract an intake workflow
// depends on: complete records, authors present, clean JSON, no flag values parsed as queries.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'tools', 'search.mjs');
const run = (args) => execFileSync('node', [CLI, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let pass = 0, fail = 0;
// Both argument orders exist in this repo: fidelity's suite uses ok(cond, name), this one uses
// ok(name, cond). That split already produced five assertions that were testing the truthiness of a
// string — i.e. assertions that could never fail. Accept either order, and REFUSE a condition that
// is not a real boolean, so the failure mode is impossible rather than merely unlikely.
const ok = (a, b, extra = '') => {
  let name, cond;
  if (typeof a === 'boolean') { name = String(b); cond = a; } else { name = a; cond = b; }
  if (typeof cond !== 'boolean') {
    fail++;
    console.log(`  ✗ ${name} — ASSERTION BUG: condition is ${typeof cond}, not boolean`);
    return;
  }
  cond ? (pass++, console.log('  ✓ ' + name + (extra ? ' — ' + extra : ''))) : (fail++, console.log('  ✗ ' + name + ' — ' + extra));
};

console.log('\n1. --help / --list-sources (no network, no keys)');
const help = run(['--help']);
ok('--help exits 0 and prints usage', /headless search/.test(help) && /--sources/.test(help));
const list = run(['--list-sources']);
ok('--list-sources lists openalex + opt-in sources', /openalex/.test(list) && /s2/.test(list) && /proxy\/key/.test(list));
ok('--list-sources lists the web source', /web \(Tavily/.test(list), list.split('\n').pop());

console.log('\n2. live search — JSON contract (real network, keyless source)');
const out = path.join(os.tmpdir(), 'll-cli-test-' + Date.now() + '.json');
run(['structured literacy dyslexia reading intervention', '--per', '2', '--sources', 'openalex', '--no-enrich', '--json', '--out', out]);
const j = JSON.parse(fs.readFileSync(out, 'utf8'));
const queries = Object.keys(j.queries);
ok('exactly one query ran', queries.length === 1, `got ${queries.length}: ${queries.join(' | ')}`);
ok('flag value not parsed as a query', !queries.some(q => /^(2|openalex|--)/.test(q)), queries.join(' | '));
ok('sources reflects --sources', j.sources.length === 1 && j.sources[0] === 'openalex');
const recs = j.queries[queries[0]].records;
ok('returned at least one record', recs.length >= 1, `${recs.length} records`);
const r = recs[0] || {};
const fields = ['title', 'authors', 'year', 'doi', 'source'];
ok('record carries the full schema', fields.every(f => f in r), 'have: ' + Object.keys(r).join(','));
ok('authors is a non-empty array', Array.isArray(r.authors) && r.authors.length > 0, `author[0]=${(r.authors || [])[0] || '—'}`);
fs.rmSync(out, { force: true });

console.log('\n3. live web search — Tavily keyless (real network)');
const wout = path.join(os.tmpdir(), 'll-cli-web-test-' + Date.now() + '.json');
run(['Tavily Search API', '--per', '1', '--sources', 'web', '--json', '--out', wout]);
const wj = JSON.parse(fs.readFileSync(wout, 'utf8'));
const wq = Object.keys(wj.queries);
const wrec = wj.queries[wq[0]]?.records?.[0] || {};
ok('web source runs through --sources web', wj.sources.length === 1 && wj.sources[0] === 'web');
ok('web record is labelled and carries URL + extracted text',
   wrec.kind === 'web' && /^https?:\/\//.test(wrec.url) && typeof wrec.abstract === 'string' && wrec.abstract.length > 50,
   `${wrec.host || 'no host'} · ${(wrec.abstract || '').length} chars`);
fs.rmSync(wout, { force: true });

// A failed screen must be visible in the RESULTS, not only on stderr: an agent that reads the
// markdown and sees no retraction warning would otherwise conclude nothing was retracted, when in
// fact nothing was checked.
const { toMarkdown } = await import('../tools/search.mjs');
const failedMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  screenFailed: { reason: 'HTTP 429', dois: 3 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('a failed retraction screen is announced in the output, not just stderr',
   /RETRACTION SCREEN DID NOT RUN/.test(failedMd) && /3 DOI\(s\) were NOT checked/.test(failedMd));
const cleanMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  screened: { dois: 3, retracted: 0 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('no banner when the screen actually ran', !/RETRACTION SCREEN DID NOT RUN/.test(cleanMd));

// A DEGRADED screen must announce that it is weaker, not merely quieter. Crossref misses some
// retractions (it has no record of 10.1378/chest.128.6.3817), so silence would read as safety.
const degradedMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  screenDegraded: { reason: 'HTTP 429', method: 'crossref', checked: 2, requested: 3, retracted: 0 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('a degraded retraction screen says it is weaker, not clear',
   /RETRACTION SCREEN DEGRADED/.test(degradedMd) && /unconfirmed, not clear/.test(degradedMd));
ok('the degraded banner reports coverage and the known Crossref blind spot',
   /2 of 3 DOI/.test(degradedMd) && /10\.1378\/chest\.128\.6\.3817/.test(degradedMd));

// The original silent-screen bug: stderr warned, markdown said nothing, so an agent read "no
// retraction warnings" as "no retractions". The banner is the fix and needs its own assertion.
const noScreenMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  screenFailed: { reason: 'HTTP 429', dois: 4 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('a screen that did not run says it did not run, in the markdown',
   /RETRACTION SCREEN DID NOT RUN/.test(noScreenMd) && /were NOT checked/.test(noScreenMd));
ok('and explicitly warns that absence of a warning means nothing',
   /absence of a warning below means/.test(noScreenMd));
ok('DEGRADED and DID NOT RUN are different sentences',
   !/DEGRADED/.test(noScreenMd));

const critMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  critique: { dois: 2, withComments: 1, errors: [] },
  queries: { q: { count: 1, errors: [], records: [
    { title: 'T', doi: '10.1/a', critique: { comments: 5, url: 'https://pubpeer.com/x' } },
  ] } },
});
ok('a criticised paper is flagged as criticised, NOT as retracted',
   /5 PubPeer comment\(s\)/.test(critMd) && /criticised, not retracted/.test(critMd));
ok('a record without comments gets no critique mark',
   !/PubPeer comment/.test(toMarkdown({ generated: 'now', per: 1, sources: ['openalex'],
     queries: { q: { count: 1, errors: [], records: [{ title: 'Clean', doi: '10.1/b' }] } } })));

const sinceMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  queries: { q: { count: 1, errors: [], records: [{ title: 'N', doi: '10.1/n', isNew: true }],
    newSince: { baselineKnown: true, baselineAt: Date.now(), count: 1 } } },
});
ok('--since marks new records and dates the baseline', /1 new since \d{4}-/.test(sinceMd) && /\*\*NEW\*\*/.test(sinceMd));
const noBaseMd = toMarkdown({ generated: 'now', per: 1, sources: ['openalex'],
  queries: { q: { count: 1, errors: [], records: [{ title: 'N', isNew: true }],
    newSince: { baselineKnown: false, baselineAt: null, count: 1 } } } });
ok('with no previous run --since says so instead of implying change',
   /no previous run to compare against/.test(noBaseMd));

// A critique screen that only reached part of the DOI list must not report "no comments" as if it
// had covered them all.
const partialMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  critique: { dois: 3, withComments: 0, errors: ['PubPeer: HTTP 500'], checked: 2, requested: 3 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('a partially-checked critique screen says PARTIAL', /PARTIAL: 2 of 3/.test(partialMd));
const fullMd = toMarkdown({
  generated: 'now', per: 1, sources: ['openalex'],
  critique: { dois: 3, withComments: 0, errors: [], checked: 3, requested: 3 },
  queries: { q: { count: 0, errors: [], records: [] } },
});
ok('a fully-checked critique screen does not cry PARTIAL', !/PARTIAL/.test(fullMd) && /checked 3 of 3/.test(fullMd));

// Result cache: discovery is cached, retraction status is not.
const cacheDir = fs.mkdtempSync(`${os.tmpdir()}/ck-cache-`);
const cacheRun = (extra = []) => {
  const outFile = path.join(cacheDir, `o-${Math.random().toString(36).slice(2)}.md`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'search.mjs'),
    'cache probe query', '--sources', 'crossref', '--per', '2', '--out', outFile, ...extra,
  ], { env: { ...process.env, CITEKIT_CACHE_DIR: cacheDir }, encoding: 'utf8' });
  return { md: fs.readFileSync(outFile, 'utf8'), err: r.stderr || '' };
};
const cold = cacheRun(['--fresh']).md;
ok('a fresh run records a cache miss', /_cache: 0 hit · 1 miss/.test(cold));
const warmRun = cacheRun();
const warm = warmRun.md;
ok('a second run is served from the cache', /_cache: 1 hit · 0 miss/.test(warm));
ok('the cached age is printed, so stale results are never silent', /cached \d+m ago/.test(warm));
const forced = cacheRun(['--max-age', '0']).md;
ok('--max-age 0 bypasses the cache', /_cache: 0 hit · 1 miss/.test(forced));
// A cache hit must never suppress the retraction screen: a paper can be retracted while its
// title, year and DOI stay the same.
ok('the retraction screen still runs on a cache hit',
   /screened \d+ DOIs/.test(warmRun.err) && !/RETRACTION SCREEN DID NOT RUN/.test(warm));
fs.rmSync(cacheDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
