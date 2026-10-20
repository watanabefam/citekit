// Smoke-test for tools/search.mjs — the headless CLI.
// Runs the CLI as a subprocess (real argv handling) and checks the contract an intake workflow
// depends on: complete records, authors present, clean JSON, no flag values parsed as queries.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'tools', 'search.mjs');
const run = (args) => execFileSync('node', [CLI, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? (pass++, console.log('  ✓ ' + name + (extra ? ' — ' + extra : ''))) : (fail++, console.log('  ✗ ' + name + ' — ' + extra)); };

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
