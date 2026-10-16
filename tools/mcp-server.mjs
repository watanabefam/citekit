#!/usr/bin/env node
// CiteKit MCP server — the nine-source search pipeline, deterministic ranking and
// citation-graph walking, exposed to any MCP client over stdio.
//
// Zero dependencies, deliberately: the repo has none and this adds none. It is a thin
// adapter over the same `loadLL()` loader tools/search.mjs uses, so the MCP server runs
// index.html's real shipping code — no reimplementation to drift out of sync.
//
// Protocol: https://modelcontextprotocol.io/specification/2025-06-18
//   initialize -> notifications/initialized -> tools/list -> tools/call
//   Newline-delimited JSON-RPC 2.0 on stdin/stdout. Diagnostics go to stderr; stdout
//   carries protocol messages only, because anything else corrupts the transport.
//
// Config — all optional. Five of the nine sources need neither a key nor a budget:
//   CITEKIT_OPENALEX_KEY   raises OpenAlex from $0.10/day to $1/day (recommended)
//   CITEKIT_S2_KEY         Semantic Scholar, lifts the shared-pool 429
//   CITEKIT_CORE_KEY       CORE
//
// Usage:  node tools/mcp-server.mjs        (a client normally spawns this itself)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLL } from './load-ll.mjs';

const PROTOCOL_VERSION = '2025-06-18';
const KEYLESS = ['openalex', 'crossref', 'epmc', 'pubmed', 'eric', 'doaj'];
const OPT_IN = ['s2', 'arxiv', 'core'];

const LL = await loadLL();
// Same env -> settings channel the CLI uses. Only overrides what was actually supplied.
if (process.env.CITEKIT_OPENALEX_KEY) LL.S.openalexKey = process.env.CITEKIT_OPENALEX_KEY;
if (process.env.CITEKIT_S2_KEY) LL.S.s2Key = process.env.CITEKIT_S2_KEY;
if (process.env.CITEKIT_CORE_KEY) LL.S.coreKey = process.env.CITEKIT_CORE_KEY;

const REGISTRY = {
  openalex: (q, o) => LL.searchOpenAlex(q, o),
  crossref: (q, o) => LL.searchCrossref(q, o),
  epmc: (q, o) => LL.searchEPMC(q, o),
  pubmed: (q, o) => LL.searchPubMed(q, o),
  eric: (q, o) => LL.searchERIC(q, o),
  doaj: (q, o) => LL.searchDOAJ(q, o),
  s2: (q, o) => LL.searchS2(q, o),
  arxiv: (q, o) => LL.searchArxiv(q, o),
  core: (q, o) => LL.searchCORE(q, o),
};

/* Keep `id` and `doi` — the citation walker needs them to seed. Dropping either turns a
   record into something expand_citations can no longer use. */
const trim = r => ({
  id: r.id, title: r.title, authors: (r.authors || []).slice(0, 8), year: r.year || null,
  venue: r.venue || '', doi: r.doi || '', oa: !!r.oa, oaStatus: r.oaStatus || '',
  pdf: r.pdf || '', citations: r.citations || 0, source: r.source || '',
  abstract: (r.abstract || '').slice(0, 600),
  ...(r.via ? { via: r.via, viaSeed: r.viaSeed } : {}),
});

async function search({ query, sources = KEYLESS, per = 10, oaOnly = false, yearFrom = '', enrich = true, limit = 15 }) {
  const chosen = (Array.isArray(sources) ? sources : String(sources).split(',')).map(s => String(s).trim()).filter(s => REGISTRY[s]);
  if (!chosen.length) throw new Error('no valid sources; known: ' + Object.keys(REGISTRY).join(', '));
  const settled = await Promise.allSettled(chosen.map(s => REGISTRY[s](query, { per, oaOnly, yearFrom })));
  const all = [], errors = [];
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') all.push(...res.value);
    else errors.push(chosen[i] + ': ' + (res.reason?.message || res.reason));
  });
  const clean = LL.dedupe(all).filter(r => r.title && r.title !== '(untitled)');
  const ranked = LL.rankResults(query, enrich ? await LL.enrichWithOpenAlex(clean) : clean);
  return { query, sources: chosen, errors, total: ranked.length, records: ranked.slice(0, limit).map(trim) };
}

async function expand({ query, dois, maxSeeds = 3, per = 200, limit = 40 }) {
  let seeds;
  if (Array.isArray(dois) && dois.length) {
    seeds = dois.slice(0, maxSeeds).map(d => ({ id: 'doi:' + String(d), doi: String(d), title: String(d) }));
  } else {
    const s = await search({ query, per: 10, limit: maxSeeds });
    seeds = s.records;
  }
  if (!seeds.length) return { query, seeds: [], added: 0, records: [], note: 'no seeds resolved, so there was nothing to walk' };
  const extra = await LL.expandCitations(seeds, { maxSeeds, per });
  return {
    query: query || null,
    seeds: seeds.map(s => ({ id: s.id, doi: s.doi, title: s.title })),
    added: extra.length,
    duplicatesCollapsed: extra.duplicatesCollapsed || 0,
    records: extra.slice(0, limit).map(trim),
    note: 'One level, both directions: via "cites-seed" means the record cites a seed, "cited-by-seed" means a seed cites it. Supplementary to a keyword search, never a replacement.',
  };
}

async function getRecord({ doi }) {
  const clean = String(doi || '').trim().replace(/^https?:\/\/doi\.org\//i, '');
  if (!/^10\./.test(clean)) throw new Error('not a DOI: ' + doi);
  const u = new URL('https://api.openalex.org/works');
  u.searchParams.set('filter', 'doi:' + clean);
  u.searchParams.set('per-page', '1');
  if (LL.S.openalexKey) u.searchParams.set('api_key', LL.S.openalexKey);
  const r = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('OpenAlex HTTP ' + r.status);
  const d = await r.json();
  const w = (d.results || [])[0];
  return w ? { found: true, record: trim(LL.openAlexToRecord(w)) } : { found: false, doi: clean };
}

const TOOLS = [
  {
    name: 'search_literature',
    title: 'Search the scholarly literature',
    description: 'Search nine scholarly databases at once (OpenAlex, Crossref, Europe PMC, PubMed, ERIC, DOAJ, CORE, Semantic Scholar, arXiv) and return records ranked deterministically — lexical relevance, citations, full-text availability and open access. Use for "what is the evidence on X", finding papers, or grounding a claim. Sources marked opt-in need a key or a CORS proxy.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query, in natural language.' },
        sources: { type: 'array', items: { type: 'string' }, description: `Which sources to query. Default: ${KEYLESS.join(', ')} (all keyless/CORS-open). Opt-in: ${OPT_IN.join(', ')}.` },
        per: { type: 'integer', description: 'Results requested per source (default 10).' },
        limit: { type: 'integer', description: 'Records returned after ranking (default 15).' },
        oaOnly: { type: 'boolean', description: 'Restrict to open access, where the source supports it.' },
        yearFrom: { type: 'string', description: 'Earliest publication year, e.g. "2015".' },
        enrich: { type: 'boolean', description: 'Batch-enrich metadata through OpenAlex (default true). Costs ~$0.0001 per 50 records.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'expand_citations',
    title: 'Walk the citation graph from a query or a set of DOIs',
    description: 'One level of citation-graph walking, both directions: who cites the seed papers (forward) and what they cite (backward). Finds literature that keyword search cannot — papers that share none of your words. Supplementary to search_literature, never a replacement. Returns records tagged with their provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A query whose top results become the seeds.' },
        dois: { type: 'array', items: { type: 'string' }, description: 'Seed by DOI instead of by query.' },
        maxSeeds: { type: 'integer', description: 'How many seeds to walk (default 3).' },
        limit: { type: 'integer', description: 'Records returned (default 40).' },
      },
    },
  },
  {
    name: 'get_record',
    title: 'Fetch one paper by DOI',
    description: 'Resolve a DOI to a full metadata record (title, authors, year, venue, open-access status, PDF link, citation count, abstract).',
    inputSchema: {
      type: 'object',
      properties: { doi: { type: 'string', description: 'The DOI, with or without the https://doi.org/ prefix.' } },
      required: ['doi'],
    },
  },
];

const HANDLERS = {
  search_literature: search,
  expand_citations: expand,
  get_record: getRecord,
};

/* ------------------------------- stdio JSON-RPC ------------------------------- */
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
  const { id, method, params } = msg;
  if (id === undefined) return;                      // a notification: no response, ever
  try {
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return reply(id, {
        protocolVersion: asked === PROTOCOL_VERSION ? PROTOCOL_VERSION : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'citekit', title: 'CiteKit scholarly search', version: '1.0.0' },
        instructions: 'Search nine scholarly databases, rank deterministically, and walk the citation graph one level in both directions. Every record carries its source and a DOI or URL where the record has one. Five sources need no key; set CITEKIT_OPENALEX_KEY in the server environment to raise the OpenAlex budget and enable the full citation walk.',
      });
    }
    if (method === 'ping') return reply(id, {});
    if (method === 'tools/list') return reply(id, { tools: TOOLS });
    if (method === 'tools/call') {
      const name = params?.name;
      const fn = HANDLERS[name];
      if (!fn) return fail(id, -32602, 'Unknown tool: ' + name);
      const args = params?.arguments || {};
      try {
        const payload = await fn(args);
        // Spec: a tool returning structured content SHOULD also return it as a text block.
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload, isError: false });
      } catch (err) {
        return reply(id, { content: [{ type: 'text', text: String(err?.message || err) }], isError: true });
      }
    }
    return fail(id, -32601, 'Method not found: ' + method);
  } catch (err) {
    return fail(id, -32603, String(err?.message || err));
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (line.trim()) handle(line);
  }
});
process.stdin.on('end', () => process.exit(0));      // stdio shutdown: input closed
