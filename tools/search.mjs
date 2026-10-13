#!/usr/bin/env node
// Headless search over citekit's adapters — a first-class CLI so the tool can feed an
// "intake" workflow (candidate generation) without a browser, and so records come out COMPLETE
// (authors, venue, DOI, OA, pdf, citations) rather than a hand-typed subset.
//
// Why this exists: driving the adapters from Node previously meant writing a throwaway DOM-stub
// harness and printing a partial subset of each record. Omitting `authors` is exactly how a
// downstream citation gets mis-attributed by hand. This prints the whole record.
//
// Usage:
//   node tools/search.mjs "retrieval practice transfer" [more queries...]
//   node tools/search.mjs --queries tests/queries.json --per 8 --json --out out.json
//   node tools/search.mjs "montessori lottery" --sources openalex,eric --oa-only --year-from 2015
//
// Flags: --per N · --sources csv · --oa-only · --year-from YYYY · --json · --md · --out FILE
//        --no-enrich · --queries FILE · --list-sources · --help
//
// Sources default to the keyless/CORS-open set. `s2`, `arxiv` need a CORS proxy (the app setting is
// S.proxy — in the UI it is Settings → Proxy URL, but the stored key is untitled `proxy`); `core` needs
// a free key. Without credentials those three are unreachable from the CLI, so they are opt-in via
// --sources AND --proxy/--core-key (or CITEKIT_PROXY / CITEKIT_CORE_KEY).
import fs from 'node:fs';
import { loadLL } from './load-ll.mjs';

const KEYLESS = ['openalex', 'crossref', 'epmc', 'pubmed', 'eric', 'doaj'];
const OPT_IN = ['s2', 'arxiv', 'core'];

function parseArgs(argv) {
  const o = { queries: [], per: 8, sources: KEYLESS.slice(), oaOnly: false, yearFrom: '', json: false, md: false, out: '', enrich: true, help: false, listSources: false,
    proxy: process.env.CITEKIT_PROXY || '', openalexKey: process.env.CITEKIT_OPENALEX_KEY || '',
    s2Key: process.env.CITEKIT_S2_KEY || '', coreKey: process.env.CITEKIT_CORE_KEY || '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--per') o.per = Math.max(1, parseInt(argv[++i], 10) || 8);
    else if (a === '--sources') o.sources = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--oa-only') o.oaOnly = true;
    else if (a === '--year-from') o.yearFrom = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--md') o.md = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--no-enrich') o.enrich = false;
    else if (a === '--queries') o.queriesFile = argv[++i];
    else if (a === '--proxy') o.proxy = argv[++i];
    else if (a === '--openalex-key') o.openalexKey = argv[++i];
    else if (a === '--s2-key') o.s2Key = argv[++i];
    else if (a === '--core-key') o.coreKey = argv[++i];
    else if (a === '--list-sources') o.listSources = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) { process.stderr.write(`unknown flag: ${a}\n`); o.help = true; }
    else o.queries.push(a);
  }
  if (o.queriesFile) {
    const raw = JSON.parse(fs.readFileSync(o.queriesFile, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.queries || []);
    for (const item of list) o.queries.push(typeof item === 'string' ? item : (item.q || item.query));
  }
  o.queries = o.queries.filter(Boolean);
  return o;
}

const HELP = `citekit headless search

  node tools/search.mjs "query one" "query two"
  node tools/search.mjs --queries tests/queries.json --per 8 --json --out candidates.json
  node tools/search.mjs "montessori lottery" --sources openalex,eric --oa-only --year-from 2015

Flags
  --per N            results per source (default 8)
  --sources csv      default: ${KEYLESS.join(',')}
                     opt-in (need proxy/key): ${OPT_IN.join(',')}
  --oa-only          open-access filter (sources that support it)
  --year-from YYYY   publication-year floor (sources that support it)
  --json | --md      output format (default: markdown to stdout)
  --out FILE         write output to FILE instead of stdout
  --no-enrich        skip the OpenAlex metadata-enrichment pass (saves metered OpenAlex calls)
  --queries FILE     read a JSON array of strings or {q|query} objects
  --list-sources     print known sources and exit

Credentials (or the CITEKIT_* env vars of the same name)
  --proxy URL        CORS proxy base for s2 + arxiv (e.g. http://127.0.0.1:8788/)
  --openalex-key K   raises OpenAlex's free daily budget from $0.10 to $1
  --s2-key K         free Semantic Scholar key (raises its 429 rate limit)
  --core-key K       free CORE key — required, core is unreachable without one`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o.queries.length && !o.listSources)) { console.log(HELP); process.exit(o.help ? 0 : 1); }

  const LL = await loadLL();
  Object.assign(LL.S, { proxy: o.proxy, openalexKey: o.openalexKey, s2Key: o.s2Key, coreKey: o.coreKey });
  const registry = {
    openalex: (q, opts) => LL.searchOpenAlex(q, opts),
    crossref: (q, opts) => LL.searchCrossref(q, opts),
    epmc: (q, opts) => LL.searchEPMC(q, opts),
    pubmed: (q, opts) => LL.searchPubMed(q, opts),
    eric: (q, opts) => LL.searchERIC(q, opts),
    doaj: (q, opts) => LL.searchDOAJ(q, opts),
    s2: (q, opts) => LL.searchS2(q, opts),
    arxiv: (q, opts) => LL.searchArxiv(q, opts),
    core: (q, opts) => LL.searchCORE(q, opts),
  };

  if (o.listSources) {
    console.log('known sources:', Object.keys(registry).join(', '));
    console.log('default:      ', KEYLESS.join(', '));
    console.log('opt-in:       ', OPT_IN.join(', '), '(proxy/key required)');
    return;
  }

  const chosen = o.sources.filter(s => registry[s]);
  const unknown = o.sources.filter(s => !registry[s]);
  if (unknown.length) process.stderr.write(`ignoring unknown source(s): ${unknown.join(', ')}\n`);
  if (!chosen.length) { process.stderr.write('no valid sources\n'); process.exit(1); }
  const NEEDS = { s2: ['proxy', '--proxy', 'CITEKIT_PROXY'], arxiv: ['proxy', '--proxy', 'CITEKIT_PROXY'],
                  core: ['coreKey', '--core-key', 'CITEKIT_CORE_KEY'] };
  const blocked = chosen.filter(s => NEEDS[s] && !LL.S[NEEDS[s][0]]);
  if (blocked.length) {
    const how = [...new Set(blocked.map(s => `${NEEDS[s][1]} (or ${NEEDS[s][2]})`))].join(' + ');
    process.stderr.write(`cannot reach ${blocked.join(', ')} without credentials — pass ${how}\n`);
  }

  const opts = { oaOnly: o.oaOnly, yearFrom: o.yearFrom, per: o.per };
  const out = { generated: new Date().toISOString(), per: o.per, sources: chosen, queries: {} };

  for (const query of o.queries) {
    process.stderr.write(`\n## ${query}\n`);
    const settled = await Promise.allSettled(chosen.map(s => registry[s](query, opts)));
    const all = [], errs = [];
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') all.push(...res.value);
      else errs.push(`${chosen[i]}: ${res.reason?.message || res.reason}`);
    });
    let ranked = [];
    try {
      const clean = LL.dedupe(all).filter(r => r.title && r.title !== '(untitled)');
      ranked = LL.rankResults(query, o.enrich ? await LL.enrichWithOpenAlex(clean) : clean);
    } catch (e) { errs.push('rank/enrich: ' + e.message); }
    process.stderr.write(`   ${all.length} raw → ${ranked.length} unique${errs.length ? ' · errors: ' + errs.join(' | ') : ''}\n`);
    out.queries[query] = { count: ranked.length, errors: errs, records: ranked };
  }

  const text = o.json ? JSON.stringify(out, null, 2) : toMarkdown(out);
  if (o.out) { fs.writeFileSync(o.out, text + '\n'); process.stderr.write(`\nwrote ${o.out}\n`); }
  else process.stdout.write(text + '\n');
}

function authors(r) { return Array.isArray(r.authors) && r.authors.length ? r.authors.join(', ') : '—'; }

function toMarkdown(out) {
  const lines = [`# citekit headless search`, `_${out.generated} · per-source ${out.per} · sources: ${out.sources.join(', ')}_`];
  for (const [query, res] of Object.entries(out.queries)) {
    lines.push(`\n## ${query}`, `_${res.count} unique${res.errors.length ? ' · ' + res.errors.join(' | ') : ''}_\n`);
    for (const r of res.records) {
      const abs = (r.abstract || '').replace(/\s+/g, ' ').slice(0, 500);
      lines.push(
        `### ${r.title || '(untitled)'} (${r.year || 'n.d.'})`,
        `**Authors:** ${authors(r)}`,
        `**Venue:** ${r.venue || '—'}  ·  **cited by:** ${r.citations || 0}  ·  **source:** ${r.source || '—'}${r.oa ? '  ·  **OA**' : ''}`,
        `**DOI:** ${r.doi || '—'}${r.url ? `  ·  ${r.url}` : ''}${r.pdf ? `\n**PDF:** ${r.pdf}` : ''}`,
        abs ? `\n${abs}` : '\n_[no abstract]_', ''
      );
    }
  }
  return lines.join('\n');
}

main().catch(e => { process.stderr.write('fatal: ' + e.stack + '\n'); process.exit(1); });
