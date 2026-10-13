// End-to-end: the app's own adapters through the REAL worker (wrangler dev).
// Proves the proxy unlock actually works, and records which sources it does and
// does not fix. Usage:  node tests/proxy-integration.mjs [proxyBaseUrl]
import fs from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:8788';
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
const els = {}; const q = s => els[s] || (els[s] = makeEl());
const tabs = ['search','library'].map(t => { const e = makeEl(); e.dataset.tab = t; return e; });
global.document = { getElementById: id => q('#'+id), querySelector: q, createElement: makeEl, querySelectorAll: s => (s==='.tab'?tabs:[]), addEventListener(){}, body: makeEl() };
global.window = { addEventListener(){} };
global.location = { origin: 'http://127.0.0.1:8777' };
global.alert = console.log; global.confirm = () => true; global.prompt = () => null;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } };
global.DOMParser = class { parseFromString(xml){
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => { const i = m[1]; const g = re => (i.match(re)||[])[1]||'';
    // real arXiv atoms put href BEFORE title="pdf" — match order-independently
    const pdfTag = [...i.matchAll(/<link\b[^>]*>/g)].map(x => x[0]).find(t => /title="pdf"/.test(t)) || '';
    const pdf = (pdfTag.match(/href="([^"]+)"/) || [])[1] || '';
    return { querySelector: sel => ({ textContent: sel==='title'?g(/<title>([\s\S]*?)<\/title>/):sel==='summary'?g(/<summary>([\s\S]*?)<\/summary>/):sel==='published'?g(/<published>([\s\S]*?)<\/published>/):'', getAttribute: () => (sel.startsWith('link')?pdf:null) }), querySelectorAll: () => [] }; });
  return { querySelectorAll: sel => (sel==='entry'?entries:[]) }; } };
global.URL.createObjectURL = () => 'blob:x'; global.URL.revokeObjectURL = () => {};
new Function('window', 'location', src)(global.window, global.location);
const LL = global.window.LL;
await new Promise(r => setTimeout(r, 30));

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n + (x ? ' — ' + x : ''))) : (fail++, console.log('  ✗ ' + n + ' — ' + x)); };

console.log(`\nProxy integration against ${base}`);
LL.S.proxy = base + '/?url=';

// arXiv — the source the proxy genuinely unlocks
const arx = await LL.searchArxiv('structured literacy', { per: 5 }).catch(e => { console.log('   arxiv err:', e.message); return []; });
ok('arXiv search works through the live worker', arx.length > 0, `${arx.length} records`);
ok('arXiv records carry real titles/years', arx.every(r => r.title.length > 5 && !/^Error/.test(r.title)), arx[0] ? `"${arx[0].title.slice(0, 50)}…" ${arx[0].year}` : 'none');
ok('arXiv pdf links mapped through the proxy', arx.some(r => /arxiv\.org\/pdf/.test(r.pdf || '')), arx.find(r => r.pdf)?.pdf?.slice(0, 50) || '');

// Semantic Scholar — expected to 429 without a key, even via the worker
const s2 = await LL.searchS2('retrieval augmented generation', { per: 5 }).catch(e => 'ERR: ' + e.message);
if (typeof s2 === 'string') {
  ok('Semantic Scholar 429 is surfaced as an actionable error, not silent zero results',
     /429/.test(s2) && /free key/.test(s2), s2.slice(0, 100));
  console.log('   · note: the worker does NOT fix S2 — only a free API key lifts the shared-pool 429');
} else {
  ok('Semantic Scholar works through the worker', s2.length > 0, `${s2.length} records`);
}

// raw passthrough checks that need headers
const preflight = await fetch(`${base}/?url=x`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8777', 'Access-Control-Request-Method': 'GET' } });
ok('preflight is answered at the edge with 204', preflight.status === 204, `HTTP ${preflight.status}`);
ok('preflight carries ACAO + Vary', preflight.headers.get('access-control-allow-origin') === '*' && preflight.headers.get('vary') === 'Origin',
   `ACAO=${preflight.headers.get('access-control-allow-origin')} Vary=${preflight.headers.get('vary')}`);
ok('preflight does NOT contact upstream (no X-Proxy-Cache header)', !preflight.headers.get('x-proxy-cache'));

const blocked = await fetch(`${base}/?url=${encodeURIComponent('https://evil.example.com/x')}`);
ok('target allowlist blocks unknown hosts with 403', blocked.status === 403, `HTTP ${blocked.status}`);

const notAllowed = await fetch(`${base}/?url=${encodeURIComponent('https://api.semanticscholar.org/x')}`, { method: 'POST' });
ok('method allowlist rejects POST with 405', notAllowed.status === 405, `HTTP ${notAllowed.status}`);

// caching: two identical GETs for an allowed, OK-status target.
// Two subtleties, both learned the hard way:
//  - the worker writes via ctx.waitUntil(), so the PUT is async: poll, don't race it.
//  - the response body MUST be drained (await .text()) or the streamed cache clone
//    never completes and every request stays a MISS. curl draining the body was what
//    made this look like a worker bug when it was a test bug.
const u = `${base}/?url=${encodeURIComponent('https://export.arxiv.org/api/query?search_query=all:phonics&max_results=1')}`;
const r1 = await fetch(u);
const b1 = await r1.text();                    // drain, or nothing commits to cache
let cacheHit = null, r2 = null, b2 = '';
for (let i = 0; i < 6 && cacheHit !== 'HIT'; i++) {
  await new Promise(r => setTimeout(r, 500));
  r2 = await fetch(u);
  b2 = await r2.text();                        // drain each attempt too
  cacheHit = r2.headers.get('x-proxy-cache');
}
ok('edge cache: a repeat request becomes a HIT once the body is drained', cacheHit === 'HIT',
   `first=${r1.headers.get('x-proxy-cache')} body=${b1.length}B · after retries=${cacheHit} body=${b2.length}B`);
ok('a cached response is byte-identical to the first', b1.length > 0 && b1 === b2, `${b1.length}B vs ${b2.length}B`);
ok('responses never leak Set-Cookie', !r1.headers.get('set-cookie'));
ok('responses carry a cacheable Cache-Control on success', /max-age=/.test(r2.headers.get('cache-control') || ''), r2.headers.get('cache-control') || '');

// --- regression: the two app<->worker seam bugs found by dogfooding the CLI -------------
// Both were invisible to this suite because it only ever exercised the ?url= form, which is
// not what a user gets from pasting the bare worker URL into Settings.

// (1) path-form proxy: S.proxy without a {url} placeholder emits <base>/<encoded-target>.
LL.S.proxy = base + '/';
const arxPath = await LL.searchArxiv('retrieval practice', { per: 3 }).catch(e => { console.log('   path-form arxiv err:', e.message); return []; });
ok('a bare base-URL proxy setting works (path form, not just ?url=)', arxPath.length > 0,
   arxPath.length ? `${arxPath.length} records` : 'returned 0 — the 400 regression is back');

// (2) caller params are re-attached to the target when the target carries none of its own.
//     arXiv requires search_query, so an empty parameter set cannot return entries.
const reattach = await fetch(`${base}/${encodeURIComponent('https://export.arxiv.org/api/query')}?search_query=all:phonics&max_results=1`);
const reattachBody = await reattach.text();
ok('caller query params are re-attached to the proxied target', reattach.status === 200 && /<entry>/.test(reattachBody),
   `HTTP ${reattach.status} · ${(reattachBody.match(/<entry>/g) || []).length} entries`);

// (3) the S2 bug: params set on the proxy URL land on the PROXY's query string, where the
//     worker drops them, so upstream received a query-less request. Assert the URL shape
//     rather than the response, because S2 429s without a key either way.
LL.S.proxy = base + '/?url=';
const realFetch = globalThis.fetch;
let captured = '';
globalThis.fetch = async (u) => { captured = String(u); return { ok: true, status: 200, json: async () => ({ data: [] }) }; };
await LL.searchS2('structured literacy', { per: 3 }).catch(() => {});
globalThis.fetch = realFetch;
let s2Target = '';
try { s2Target = new URL(captured).searchParams.get('url') || ''; } catch {}
ok('S2 builds the full target (query + fields) BEFORE proxying it',
   /query=/.test(s2Target) && /fields=/.test(s2Target),
   s2Target ? s2Target.slice(0, 74) + '…' : `captured: ${captured.slice(0, 74)}`);

console.log(`\n=== proxy integration: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
