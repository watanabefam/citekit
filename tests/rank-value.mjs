// Does the deterministic consensus re-rank actually change the top-8 for the better?
// Compares the previous ranking (lexical overlap + a small citation nudge) against the
// new composite (lexical + cross-source consensus + citations + readability) on LIVE
// merged data. Everything here is objective; whether *answers* improve needs labelled
// evaluation, which this is not — it measures the composition of what gets fed to the model.
// Usage: node tests/rank-value.mjs ["query" ...]
import fs from 'node:fs';
import http from 'node:http';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
function makeEl(tag = 'div') {
  const e = { tagName: tag, _l: {}, children: [], style: {}, dataset: {}, _h: '', _t: '', value: '', checked: false,
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f;}, contains(c){return this._s.has(c);} },
    addEventListener(ev,fn){ (this._l[ev] ||= []).push(fn); }, appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c => this.children.push(c)); }, prepend(c){ this.children.unshift(c); }, insertAdjacentHTML(p,h){ this._h += h; },
    setAttribute(k,v){ this['_a_'+k]=v; }, getAttribute(k){ return this['_a_'+k]; }, querySelector(){ return makeEl(); }, querySelectorAll(){ return []; },
    click(){}, focus(){}, close(){}, showModal(){}, scrollIntoView(){}, remove(){},
    set textContent(v){ this._t=String(v); }, get textContent(){ return this._t; },
    set innerHTML(v){ this._h=String(v); }, get innerHTML(){ return this._h; },
    set className(v){ this.classList._s=new Set(String(v).split(/\s+/).filter(Boolean)); }, get className(){ return [...this.classList._s].join(' '); },
    set disabled(v){ this._d=v; }, get disabled(){ return this._d; } };
  return e;
}
const els = {};
const q = s => els[s] || (els[s] = makeEl());
const tabs = ['search','library'].map(t => { const e = makeEl(); e.dataset.tab = t; return e; });
global.document = { getElementById: id => q('#'+id), querySelector: q, createElement: makeEl, querySelectorAll: s => (s==='.tab'?tabs:[]), addEventListener(){}, body: makeEl() };
global.window = { addEventListener(){} };
global.location = { origin: 'http://127.0.0.1:8777' };
global.alert = console.log; global.confirm = () => true; global.prompt = () => null;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } };
global.DOMParser = class { parseFromString(xml){
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => { const i = m[1]; const g = re => (i.match(re)||[])[1]||'';
    const pdf = (i.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/)||[])[1]||'';
    return { querySelector: sel => ({ textContent: sel==='title'?g(/<title>([\s\S]*?)<\/title>/):sel==='summary'?g(/<summary>([\s\S]*?)<\/summary>/):sel==='published'?g(/<published>([\s\S]*?)<\/published>/):'', getAttribute: () => (sel.startsWith('link')?pdf:null) }), querySelectorAll: () => [] }; });
  return { querySelectorAll: sel => (sel==='entry'?entries:[]) }; } };
global.URL.createObjectURL = () => 'blob:x'; global.URL.revokeObjectURL = () => {};
new Function('window', 'location', src)(global.window, global.location);
const LL = global.window.LL;
await new Promise(r => setTimeout(r, 30));

const relay = http.createServer(async (req, res) => {
  const target = new URL(req.url, 'http://x').searchParams.get('url');
  try { const up = await fetch(target, { headers: { Accept: 'application/json' } });
    res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' });
    res.end(await up.text());
  } catch { res.writeHead(502); res.end('{}'); }
});
await new Promise(r => relay.listen(0, '127.0.0.1', r));
LL.S.proxy = `http://127.0.0.1:${relay.address().port}/?url=`;

const SOURCES = [
  ['OpenAlex', q_ => LL.searchOpenAlex(q_, { per: 20 })],
  ['Crossref', q_ => LL.searchCrossref(q_, { per: 20 })],
  ['Europe PMC', q_ => LL.searchEPMC(q_, { per: 20 })],
  ['ERIC', q_ => LL.searchERIC(q_, { per: 20 })],
  ['DOAJ', q_ => LL.searchDOAJ(q_, { per: 20 })],
  ['Core', q_ => LL.searchCORE(q_, { per: 20 })],
  ['PubMed', q_ => LL.searchPubMed(q_, { per: 20 })],
  ['arXiv', q_ => LL.searchArxiv(q_, { per: 20 })]
];

const STOP = new Set('a an the of and or for to in on with is are was were be been this that these those as by from at it its we our their there here what which who how why does do did can could should would may might must not no into over under between using used use study studies results result method methods approach paper we'.split(' '));
const terms = s => (s || '').toLowerCase().match(/[a-z][a-z\-]{2,}/g)?.filter(w => !STOP.has(w)) || [];
const scorePage = (text, qT) => {
  if (!text) return 0;
  const words = terms(text); const tf = new Map();
  for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
  let s = 0;
  for (const t of qT) { const c = tf.get(t) || 0; if (c) s += 1 + Math.log(c); if (new RegExp('\\b' + t + '\\w*', 'i').test(text)) s += 0.3; }
  return s / Math.sqrt(words.length || 1);
};

let queries = process.argv.slice(2);
if (!queries.length) queries = ['structured literacy dyslexia reading intervention', 'retrieval augmented generation clinical decision support'];

for (const query of queries) {
  const qT = terms(query);
  const all = [];
  for (const [name, fn] of SOURCES) {
    try { (await fn(query)).forEach(r => all.push(r)); } catch { /* source unavailable */ }
  }
  let merged = LL.dedupe(all).filter(r => r.title && r.title !== '(untitled)');
  merged = await LL.enrichWithOpenAlex(merged).catch(() => merged);
  if (!merged.length) { console.log('\n' + query + ': no records'); continue; }

  const legacy = [...merged].map((r, i) => ({ r, i, s: scorePage(r.abstract || '', qT) + Math.log(1 + (r.citations || 0)) * 0.05 }))
    .sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.r);
  const composite = LL.rankResults(query, merged).slice(0, 8);
  const titleHit = r => qT.some(t => new RegExp('\\b' + t.slice(0, Math.max(4, t.length - 2)), 'i').test(r.title || '')) ? 1 : 0;
  const stat = set => ({
    consensus: (set.reduce((a, r) => a + (r._also?.length || 1), 0) / set.length).toFixed(2),
    cites: Math.round(set.reduce((a, r) => a + (r.citations || 0), 0) / set.length),
    oa: set.filter(r => r.oa).length,
    link: set.filter(r => /^https?:\/\//.test(r.pdf || '')).length,
    titlePrec: Math.round(100 * set.reduce((a, r) => a + titleHit(r), 0) / set.length)
  });
  const L = stat(legacy), C = stat(composite);
  const overlap = legacy.filter(r => composite.some(c => c.id === r.id)).length;
  console.log(`\n══════ ${query} ══════`);
  console.log(`  merged pool: ${merged.length} records · enriched ${merged.enrichedCount ?? 0}`);
  console.log('  top-8 by            old ranking      new composite');
  console.log(`    mean sources/rec  ${String(L.consensus).padStart(10)}      ${String(C.consensus).padStart(10)}`);
  console.log(`    mean citations    ${String(L.cites).padStart(10)}      ${String(C.cites).padStart(10)}`);
  console.log(`    open access       ${String(L.oa + '/8').padStart(10)}      ${String(C.oa + '/8').padStart(10)}`);
  console.log(`    full-text link    ${String(L.link + '/8').padStart(10)}      ${String(C.link + '/8').padStart(10)}`);
  console.log(`    title-query match ${String(L.titlePrec + '%').padStart(10)}      ${String(C.titlePrec + '%').padStart(10)}`);
  console.log(`  overlap: ${overlap}/8 records in common → ${8 - overlap}/8 selections changed`);
  console.log('  top-3 new ranking:');
  composite.slice(0, 3).forEach((r, i) => console.log(`    ${i + 1}. [${r._also?.length || 1} src, ${r.citations || 0} cites, rank ${r._rank.score.toFixed(2)}] ${r.title.slice(0, 72)}`));
  const c0 = merged.filter(r => (r._also?.length || 1) === 1), cN = merged.filter(r => (r._also?.length || 1) > 1);
  if (c0.length && cN.length) {
    const mean = s => s.length ? Math.round(s.reduce((a, r) => a + (r.citations || 0), 0) / s.length) : 0;
    const absLen = s => s.length ? Math.round(s.reduce((a, r) => a + (r.abstract || '').length, 0) / s.length) : 0;
    console.log(`  is consensus a real signal? single-source recs: ${c0.length} (mean ${mean(c0)} cites, ${absLen(c0)} char abs) · multi-source: ${cN.length} (mean ${mean(cN)} cites, ${absLen(cN)} char abs)`);
  }
}
relay.close();
