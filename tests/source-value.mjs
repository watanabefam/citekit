// Does adding sources actually help? Measures marginal value per source:
// raw hits, how many survive dedupe as the PRIMARY record, and how many are
// "unique finds" no other source returned. Also reports OA/abstract coverage.
// Usage: node tests/source-value.mjs ["query one" "query two" ...]
import fs from 'node:fs';
import http from 'node:http';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

/* ---- DOM stub (same technique as verify.mjs) ---- */
function makeEl(tag = 'div') {
  const e = { tagName: tag, _l: {}, children: [], style: {}, dataset: {}, _h: '', _t: '', value: '', checked: false,
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f;}, contains(c){return this._s.has(c);} },
    addEventListener(ev, fn){ (this._l[ev] ||= []).push(fn); }, appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c => this.children.push(c)); }, prepend(c){ this.children.unshift(c); },
    insertAdjacentHTML(p, h){ this._h += h; }, setAttribute(k,v){ this['_a_'+k]=v; }, getAttribute(k){ return this['_a_'+k]; },
    querySelector(){ return makeEl(); }, querySelectorAll(){ return []; }, click(){}, focus(){}, close(){}, showModal(){}, remove(){},
    scrollIntoView(){}, set textContent(v){ this._t = String(v); }, get textContent(){ return this._t; },
    set innerHTML(v){ this._h = String(v); }, get innerHTML(){ return this._h; },
    set className(v){ this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }, get className(){ return [...this.classList._s].join(' '); },
    set disabled(v){ this._d = v; }, get disabled(){ return this._d; } };
  return e;
}
const els = {};
const q = s => els[s] || (els[s] = makeEl());
const tabs = ['search','library'].map(t => { const e = makeEl(); e.dataset.tab = t; return e; });
global.document = { getElementById: id => q('#'+id), querySelector: q, createElement: makeEl,
  querySelectorAll: sel => (sel === '.tab' ? tabs : []), addEventListener(){}, body: makeEl() };
global.window = { addEventListener(){} };
global.location = { origin: 'http://127.0.0.1:8777' };
global.alert = console.log; global.confirm = () => true; global.prompt = () => null;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k,v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.DOMParser = class {
  parseFromString(xml) {
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
      const inner = m[1];
      const g = re => (inner.match(re) || [])[1] || '';
      const pdf = (inner.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/) || [])[1] || '';
      return { querySelector: sel => ({ textContent: sel === 'title' ? g(/<title>([\s\S]*?)<\/title>/) : sel === 'summary' ? g(/<summary>([\s\S]*?)<\/summary>/) : sel === 'published' ? g(/<published>([\s\S]*?)<\/published>/) : '', getAttribute: () => (sel.startsWith('link') ? pdf : null) }),
        querySelectorAll: () => [] };
    });
    return { querySelectorAll: sel => (sel === 'entry' ? entries : []) };
  }
};
global.URL.createObjectURL = () => 'blob:x'; global.URL.revokeObjectURL = () => {};
new Function('window', 'location', src)(global.window, global.location);
const LL = global.window.LL;
await new Promise(r => setTimeout(r, 30));

/* ---- pass-through relay so proxy-gated sources can be exercised ---- */
const relay = http.createServer(async (req, res) => {
  const target = new URL(req.url, 'http://x').searchParams.get('url');
  try { const up = await fetch(target, { headers: { Accept: 'application/json' } });
    res.writeHead(up.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(await up.text());
  } catch { res.writeHead(502); res.end('{}'); }
});
await new Promise(r => relay.listen(0, '127.0.0.1', r));
LL.S.proxy = `http://127.0.0.1:${relay.address().port}/?url=`;

const SOURCES = [
  ['OpenAlex', () => LL.searchOpenAlex(q_, { per: 20 })],
  ['Crossref', () => LL.searchCrossref(q_, { per: 20 })],
  ['Europe PMC', () => LL.searchEPMC(q_, { per: 20 })],
  ['ERIC', () => LL.searchERIC(q_, { per: 20 })],
  ['DOAJ', () => LL.searchDOAJ(q_, { per: 20 })],
  ['CORE', () => LL.searchCORE(q_, { per: 20 })],
  ['PubMed', () => LL.searchPubMed(q_, { per: 20 })],
  ['SemanticScholar', () => LL.searchS2(q_, { per: 20 })],
  ['arXiv', () => LL.searchArxiv(q_, { per: 20 })]
];

let q_ = '';
const queries = process.argv.slice(2);
if (!queries.length) queries.push('structured literacy dyslexia reading intervention', 'retrieval augmented generation');

for (const query of queries) {
  q_ = query;
  console.log('\n══════ ' + query + ' ══════');
  const perSource = {};
  const all = [];
  for (const [name, fn] of SOURCES) {
    try {
      const recs = await fn();
      perSource[name] = { n: recs.length, err: null };
      recs.forEach(r => all.push({ ...r, _src: name }));
    } catch (e) { perSource[name] = { n: 0, err: e.message.slice(0, 60) }; }
  }
  // dedupe, tracking which sources each surviving record came from
  const byKey = new Map();
  for (const r of all) {
    const key = (r.doi || '').toLowerCase() || (r.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { first: r._src, sources: new Set([r._src]), rec: r });
    else { const e = byKey.get(key); e.sources.add(r._src); if ((r.abstract || '').length > (e.rec.abstract || '').length) e.rec = r; }
  }
  const uniq = [...byKey.values()];
  const names = SOURCES.map(s => s[0]);
  console.log('  raw hits    ' + names.map(n => `${n}=${perSource[n].n}`).join('  '));
  const errs = names.filter(n => perSource[n].err);
  if (errs.length) errs.forEach(n => console.log(`    ! ${n}: ${perSource[n].err}`));
  console.log(`  merged      ${all.length} → ${uniq.length} unique records`);
  console.log('  marginal value (unique finds = records ONLY this source returned):');
  for (const n of names) {
    const only = uniq.filter(u => u.sources.size === 1 && u.first === n).length;
    const prim = uniq.filter(u => u.first === n).length;
    const contrib = uniq.filter(u => u.sources.has(n)).length;
    console.log(`    ${n.padEnd(16)} primary=${String(prim).padStart(3)}  contributed=${String(contrib).padStart(3)}  UNIQUE=${String(only).padStart(3)}`);
  }
  const cov = set => {
    const withAbs = set.filter(u => ((u.rec || u).abstract || '').length > 150).length;
    const withPdf = set.filter(u => /^https?:\/\//.test((u.rec || u).pdf || '')).length;
    const oa = set.filter(u => (u.rec || u).oa).length;
    return `abstract ${Math.round(100*withAbs/set.length)}%  OA ${Math.round(100*oa/set.length)}%  full-text link ${Math.round(100*withPdf/set.length)}%`;
  };
  console.log('  coverage BEFORE enrichment: ' + cov(uniq));
  const flat = uniq.map(u => u.rec);
  const enr = await LL.enrichWithOpenAlex(flat).catch(() => flat);
  console.log(`  coverage AFTER  enrichment: ${cov(enr)}   (${enr.enrichedCount ?? 0}/${flat.length} records matched by DOI in OpenAlex)`);
}
relay.close();
