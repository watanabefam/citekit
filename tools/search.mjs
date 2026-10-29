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
//        --tavily-key K · --web-domains csv · --web-time day|week|month|year
//
// Sources default to the keyless/CORS-open set. `s2`, `arxiv` need a CORS proxy (the app setting is
// S.proxy — in the UI it is Settings → Proxy URL, but the stored key is untitled `proxy`); `core` needs
// a free key. Without credentials those three are unreachable from the CLI, so they are opt-in via
// --sources AND --proxy/--core-key (or CITEKIT_PROXY / CITEKIT_CORE_KEY). `web` is Tavily: keyless by
// default, or --tavily-key / TAVILY_API_KEY / CITEKIT_TAVILY_KEY.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLL } from './load-ll.mjs';
import { screenDois } from './fidelity.mjs';
// One key resolution for both tools: env var first, then ~/.config/citekit/openalex.key.
// search.mjs previously read only the env var, so a key placed in the file (the documented way,
// and the same convention as tavily.key) was silently ignored by every search.
import { openAlexKey, critiqueDois, crossrefRetractionFallback } from './fidelity.mjs';

const KEYLESS = ['openalex', 'crossref', 'epmc', 'pubmed', 'eric', 'doaj'];
const OPT_IN = ['s2', 'arxiv', 'core'];

function parseArgs(argv) {
  const o = { queries: [], per: 8, sources: KEYLESS.slice(), oaOnly: false, yearFrom: '', json: false, md: false, out: '', enrich: true, help: false, listSources: false,
    fresh: false, maxAge: 6, since: false, noCritique: false,
    proxy: process.env.CITEKIT_PROXY || '', openalexKey: openAlexKey(),
    s2Key: process.env.CITEKIT_S2_KEY || '', coreKey: process.env.CITEKIT_CORE_KEY || '',
    tavilyKey: process.env.CITEKIT_TAVILY_KEY || process.env.TAVILY_API_KEY || '',
    webDomains: [], webTimeRange: '' };
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
    else if (a === '--no-screen') o.noScreen = true;
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--max-age') o.maxAge = Math.max(0, parseFloat(argv[++i]) || 0);
    else if (a === '--since') o.since = true;
    else if (a === '--no-critique') o.noCritique = true;
    else if (a === '--queries') o.queriesFile = argv[++i];
    else if (a === '--proxy') o.proxy = argv[++i];
    else if (a === '--openalex-key') o.openalexKey = argv[++i];
    else if (a === '--s2-key') o.s2Key = argv[++i];
    else if (a === '--core-key') o.coreKey = argv[++i];
    else if (a === '--tavily-key' || a === '--web-key') o.tavilyKey = argv[++i];
    else if (a === '--web-domains') o.webDomains = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--web-time') o.webTimeRange = argv[++i];
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
                     web: Tavily (keyless by default)
  --oa-only          open-access filter (sources that support it)
  --year-from YYYY   publication-year floor (sources that support it)
  --json | --md      output format (default: markdown to stdout)
  --out FILE         write output to FILE instead of stdout
  --no-enrich        skip the OpenAlex metadata-enrichment pass (saves metered OpenAlex calls)
  --no-screen        skip the retraction screen (one batched OpenAlex call otherwise)
  --fresh            ignore the result cache and re-query every source
  --max-age H        reuse cached results up to H hours old (default 6; 0 = never)
  --since            re-query and mark what is NEW since the last run of the same query
  --no-critique      skip the PubPeer critique check (one batched call otherwise)
  --queries FILE     read a JSON array of strings or {q|query} objects
  --list-sources     print known sources and exit

Credentials (or the CITEKIT_* env vars of the same name)
  --proxy URL        CORS proxy base for s2 + arxiv (e.g. http://127.0.0.1:8788/)
  --openalex-key K   raises OpenAlex's free daily budget from $0.10 to $1
  --s2-key K         free Semantic Scholar key (raises its 429 rate limit)
  --core-key K       free CORE key — required, core is unreachable without one
  --tavily-key K     optional Tavily key for web (keyless works with limits)
  --web-domains csv  optional Tavily include-list, e.g. who.int,cdc.gov
  --web-time RANGE   optional Tavily recency: day|week|month|year`;

const humanAge = ms => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
};

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o.queries.length && !o.listSources)) { console.log(HELP); process.exit(o.help ? 0 : 1); }

  const LL = await loadLL();
  Object.assign(LL.S, { proxy: o.proxy, openalexKey: o.openalexKey, s2Key: o.s2Key, coreKey: o.coreKey, tavilyKey: o.tavilyKey });
  const registry = {
    web: (q, opts) => LL.searchWeb(q, { per: opts.per, domains: o.webDomains, timeRange: o.webTimeRange }),
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
    console.log('web:           web (Tavily; keyless or --tavily-key)');
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
  const { homedir } = await import('node:os');
  const crypto = await import('node:crypto');
  const cacheDir = process.env.CITEKIT_CACHE_DIR || `${homedir()}/.cache/citekit/search`;

  for (const query of o.queries) {
    process.stderr.write(`\n## ${query}\n`);

    /* Discovery is cacheable; RETRACTION STATUS IS NOT. The cache stores what the sources returned
       and nothing else — the screen below always re-runs, because a paper's standing can change
       while its title, year and DOI cannot. Caching a clean verdict would be the one stale value
       that actually hurts someone. */
    const ckey = crypto.createHash('sha1')
      .update(JSON.stringify({ q: query, s: chosen, per: o.per, enrich: !!o.enrich, yf: o.yearFrom }))
      .digest('hex').slice(0, 20);
    const cfile = `${cacheDir}/${ckey}.json`;
    // --since needs BOTH halves: it ignores the cache so results are current, but still reads the
    // cache as the baseline to diff against. Reading and reusing are different decisions.
    let baseline = null;
    if (o.since || !o.fresh) {
      try { baseline = JSON.parse(fs.readFileSync(cfile, 'utf8')); } catch { baseline = null; }
    }
    if (!o.fresh && !o.since) {
      try {
        const c = baseline;
        if (c && Array.isArray(c.records) && Date.now() - c.at <= o.maxAge * 3600e3) {
          out.cache = out.cache || { hits: 0, misses: 0, maxAge: o.maxAge };
          out.cache.hits++;
          out.queries[query] = { count: c.records.length, errors: c.errors || [], records: c.records, cachedAt: c.at };
          process.stderr.write(`   cache hit: ${c.records.length} records, ${humanAge(c.at)} old `
            + `(retraction screen still runs fresh)\n`);
          continue;
        }
      } catch { /* miss or expired */ }
    }

    const settled = await Promise.allSettled(chosen.map(s => registry[s](query, opts)));
    const all = [], errs = [];
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') all.push(...res.value);
      else errs.push(`${chosen[i]}: ${res.reason?.message || res.reason}`);
    });
    let ranked = [];
    try {
      // Web and papers stay separate: a web page must never be merged into a paper by title,
      // and its provider score must not be replaced by the scholarly rank formula.
      const rawWeb = all.filter(r => r.kind === 'web');
      const rawPapers = all.filter(r => r.kind !== 'web');
      const clean = LL.dedupe(rawPapers).filter(r => r.title && r.title !== '(untitled)');
      const papers = LL.rankResults(query, o.enrich ? await LL.enrichWithOpenAlex(clean) : clean);
      const web = LL.rankWebResults(query, LL.dedupeWeb(rawWeb));
      ranked = papers.concat(web);
    } catch (e) { errs.push('rank/enrich: ' + e.message); }
    process.stderr.write(`   ${all.length} raw → ${ranked.length} unique${errs.length ? ' · errors: ' + errs.join(' | ') : ''}\n`);
    out.queries[query] = { count: ranked.length, errors: errs, records: ranked };
    if (o.since) {
      // What is NEW relative to the last run of this same query. Without a baseline there is nothing
      // to compare against, so everything is new and the output says so rather than implying change.
      const ident = r => String(r.doi || r.title || '').toLowerCase();
      const prev = new Set((baseline?.records || []).map(ident));
      const fresh = ranked.filter(r => !prev.has(ident(r)));
      for (const r of fresh) r.isNew = true;
      out.queries[query].newSince = {
        baselineAt: baseline?.at || null,
        baselineKnown: !!(baseline && Array.isArray(baseline.records)),
        count: fresh.length,
      };
    }
    out.cache = out.cache || { hits: 0, misses: 0, maxAge: o.maxAge };
    out.cache.misses++;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cfile, JSON.stringify({ at: Date.now(), records: ranked, errors: errs }));
    } catch { /* cache write is best-effort */ }
  }

  /* Retraction screen — one batched OpenAlex call across EVERY query in this run.
     Probed: pipe-separated doi filter returns the whole set in one request at cost_usd 0.0001,
     so screening costs one metered call regardless of how many results came back.
     It answers a different question from the draft audit: not "is my claim faithful" but "is this
     paper still standing". Neither substitutes for the other — the six real defects in the
     document this tooling was built for involved no retracted work at all.
     Never reported as "clean": a missing flag means no retraction ON RECORD. Coverage depends on
     the publisher and on Retraction Watch's feed. */
  if (!o.noScreen) {
    const all = Object.values(out.queries).flatMap(q => q.records).filter(r => r.doi);
    const dois = [...new Set(all.map(r => r.doi))];
    if (dois.length) {
      let flagged = 0;
      try {
        const verdicts = await screenDois(dois);
        for (const q of Object.values(out.queries)) {
          for (const r of q.records) {
            const v = verdicts.get(String(r.doi || '').toLowerCase());
            if (!v) continue;
            r.retraction = { status: v.status, noticeType: v.noticeType, evidence: v.evidence };
            if (v.status === 'retracted') flagged++;
          }
        }
        out.screened = { at: new Date().toISOString(), dois: dois.length, retracted: flagged };
        const hits = all.filter(r => r.retraction?.status === 'retracted');
        if (hits.length) {
          process.stderr.write(`\n\u26a0 ${hits.length} RETRACTED record(s) in these results:\n`);
          for (const h of hits) process.stderr.write(`   ${h.doi}  ${(h.title || '').slice(0, 70)}\n`);
        } else {
          process.stderr.write(`   screened ${dois.length} DOIs: no retraction on record\n`);
        }
      } catch (e) {
        // OpenAlex is unavailable. Crossref can stand in, but it is INCOMPLETE — measured: it
        // returns 0 notices for 10.1378/chest.128.6.3817, a retraction OpenAlex knows about. So the
        // fallback runs AND says it is weaker. A silent substitution would recreate exactly the bug
        // this screen exists to prevent: no warning reading as no problem.
        let fb = { hits: new Map(), errors: [], requested: dois.length, checked: 0 };
        try { fb = await crossrefRetractionFallback(dois); } catch { /* no fallback available */ }
        for (const r of all) {
          const v = fb.hits.get(String(r.doi || '').toLowerCase());
          if (!v) continue;
          r.retraction = { status: 'retracted', noticeType: 'retraction', evidence: ['crossref-updates'] };
          flagged++;
        }
        if (fb.checked) {
          out.screenDegraded = {
            reason: e.message, method: 'crossref',
            checked: fb.checked, requested: fb.requested, retracted: flagged,
          };
          process.stderr.write(`   retraction screen DEGRADED: ${e.message} — Crossref fallback `
            + `checked ${fb.checked}/${fb.requested} DOIs and can miss retractions\n`);
        } else {
          out.screenFailed = { reason: e.message, dois: dois.length };
          process.stderr.write(`   retraction screen unavailable: ${e.message}\n`);
        }
      }
    }
  }

  /* Critique screen — PubPeer. A different question from "is it retracted": "has it been argued
     with". Batchable by DOI (probed: 60 DOIs in one POST returns 200), so one call per run. Never
     cached and never stored in the search cache: comments accumulate while a DOI stays fixed. */
  if (!o.noCritique) {
    const all = Object.values(out.queries).flatMap(q => q.records).filter(r => r.doi);
    const dois = [...new Set(all.map(r => String(r.doi).toLowerCase()))];
    if (dois.length) {
      try {
        const { hits, errors } = await critiqueDois(dois);
        let withComments = 0;
        for (const r of all) {
          const c = hits.get(String(r.doi || '').toLowerCase());
          if (!c || !c.comments) continue;
          r.critique = c;
          withComments++;
        }
        out.critique = { dois: dois.length, withComments, errors };
        if (withComments) {
          process.stderr.write(`\n\u26a0 ${withComments} record(s) carry PubPeer comments `
            + `(not retracted — criticised):\n`);
          for (const r of all.filter(x => x.critique)) {
            process.stderr.write(`   ${r.doi}  ${r.critique.comments} comment(s)\n`);
          }
        } else {
          process.stderr.write(`   critique: no PubPeer comments on ${dois.length} DOI(s)\n`);
        }
      } catch (e) {
        out.critique = { dois: dois.length, errors: [String(e.message).slice(0, 80)] };
        process.stderr.write(`   critique screen unavailable: ${e.message}\n`);
      }
    }
  }

  const text = o.json ? JSON.stringify(out, null, 2) : toMarkdown(out);
  if (o.out) { fs.writeFileSync(o.out, text + '\n'); process.stderr.write(`\nwrote ${o.out}\n`); }
  else process.stdout.write(text + '\n');
}

function authors(r) { return Array.isArray(r.authors) && r.authors.length ? r.authors.join(', ') : '—'; }

export function toMarkdown(out) {
  const lines = [`# citekit headless search`, `_${out.generated} · per-source ${out.per} · sources: ${out.sources.join(', ')}_`];
  if (out.screenFailed) {
    lines.push('', `> **\u26a0 RETRACTION SCREEN DID NOT RUN** \u2014 ${out.screenFailed.reason}. `
      + `${out.screenFailed.dois} DOI(s) were NOT checked, so the absence of a warning below means `
      + `nothing. Re-run before relying on these results.`);
  }
  if (out.cache) {
    lines.push('', `_cache: ${out.cache.hits} hit \u00b7 ${out.cache.misses} miss \u00b7 max age ${out.cache.maxAge}h `
      + `\u2014 discovery is cached, **retraction status is always re-checked**; use --fresh to bypass_`);
  }
  if (out.screenDegraded) {
    lines.push('', `> **\u26a0 RETRACTION SCREEN DEGRADED** \u2014 ${out.screenDegraded.reason}. Fell back `
      + `to Crossref for ${out.screenDegraded.checked} of ${out.screenDegraded.requested} DOI(s). `
      + `Crossref misses some retractions \u2014 it has no record of 10.1378/chest.128.6.3817 \u2014 so a `
      + `clean result here is unconfirmed, not clear.`);
  }
  if (out.critique) {
    lines.push('', `_critique: PubPeer checked ${out.critique.dois} DOI(s), ${out.critique.withComments} `
      + `with comments${out.critique.errors?.length ? ' \u00b7 ' + out.critique.errors.join(' | ') : ''} `
      + `\u2014 criticism is not retraction_`);
  }
  for (const [query, res] of Object.entries(out.queries)) {
    const since = res.newSince
      ? ` \u00b7 ${res.newSince.count} new${res.newSince.baselineKnown
        ? ` since ${new Date(res.newSince.baselineAt).toISOString().slice(0, 16).replace('T', ' ')}`
        : ' (no previous run to compare against)'}`
      : '';
    lines.push(`\n## ${query}`, `_${res.count} unique${res.cachedAt ? ` · cached ${humanAge(res.cachedAt)} ago` : ''}${since}${res.errors.length ? ' · ' + res.errors.join(' | ') : ''}_\n`);
    for (const r of res.records) {
      const abs = (r.abstract || '').replace(/\s+/g, ' ').slice(0, 500);
      lines.push(...[
        `### ${r.title || '(untitled)'} (${r.year || 'n.d.'})`,
        `**Authors:** ${authors(r)}`,
        `**Type:** ${r.kind === 'web' ? 'web page (not peer-reviewed)' : 'scholarly record'}`,
        `**Venue:** ${r.venue || '—'}  ·  **cited by:** ${r.citations || 0}  ·  **source:** ${r.source || '—'}${r.oa ? '  ·  **OA**' : ''}`,
        `**DOI:** ${r.doi || '—'}${r.url ? `  ·  ${r.url}` : ''}${r.pdf ? `\n**PDF:** ${r.pdf}` : ''}`,
        r.retraction?.status === 'retracted' ? `**\u26a0 RETRACTED** \u2014 do not cite (detected via ${r.retraction.evidence.join(', ')})` : '',
        r.retraction?.status === 'is-a-notice' ? '**Notice of retraction** \u2014 this record is the notice, not the retracted work' : '',
        r.critique ? `**\u26a0 ${r.critique.comments} PubPeer comment(s)** \u2014 criticised, not retracted${r.critique.url ? ` \u2014 ${r.critique.url}` : ''}` : '',
        r.isNew ? '**NEW** \u2014 not present in the previous run of this query' : '',
        abs ? `\n${abs}` : '\n_[no abstract]_', '',
      ].filter(x => x !== ''));
    }
  }
  return lines.join('\n');
}

// Run only when invoked directly. Importing this module used to launch a search and then exit the
// process, which made `toMarkdown` untestable — the one function that decides what a caller actually
// sees. Nothing else imports this file, so the guard changes no existing behaviour.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(e => { process.stderr.write('fatal: ' + e.stack + '\n'); process.exit(1); });
}
