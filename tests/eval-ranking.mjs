// Ranking evaluation, built to the conventions the IR literature uses (TREC-style):
//
//  * DEPTH-K POOLING: for each query, judge the union of the top-k documents from every
//    ranking variant being compared. Documents outside the pool are assumed non-relevant.
//  * GRADED RELEVANCE (0-3) and nDCG@k as the primary metric, with P@k alongside.
//  * TRAIN/TEST SPLIT of queries. Weights are chosen on train and reported on test —
//    "we strongly recommend not to iterate over the TREC sets" applies equally to a
//    12-query set of your own.
//  * The literature also says a small query set is under-powered (MTC needs ~83 queries
//    for a stable ranking; 30-60 judgments/query with ~100 queries is the usual budget).
//    12 queries is NOT that. Treat differences below as directional, not significant.
//
// LIMITATION, stated up front: judgments are produced by the rule-based rubric in
// tests/queries.json, not by humans. A rubric is a weaker, cheaper judge than a person,
// and its core-term lists are deliberately broader than the query so that lexical
// overlap alone cannot win. It still favours semantic on-topic-ness imperfectly.
//
// Usage: node tests/eval-ranking.mjs [--judgments out.json]
import fs from 'node:fs';
import http from 'node:http';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const QUERIES = JSON.parse(fs.readFileSync(new URL('./queries.json', import.meta.url), 'utf8')).queries;

/* ---------- configuration: who judges, and with what ----------
 * Judgments are resolved in order of authority:
 *   1. tests/judgments.json       hand adjudication (a person read the documents)
 *   2. tests/judgments.model.json cached model verdicts (written by --judge-model)
 *   3. the rule-based rubric      the fallback, and the thing this file exists to distrust
 * The rubric alone grades ~98% of pooled documents as relevant, which is why it cannot
 * separate ranking variants. 1 and 2 exist to fix that.
 * Usage: node tests/eval-ranking.mjs --judge-model gpt-4o-mini --provider openai --llm-key $KEY
 *        (or CITEKIT_JUDGE_MODEL / CITEKIT_PROVIDER / CITEKIT_API_KEY / CITEKIT_BASE_URL)
 */
const ARG = process.argv.slice(2);
const flag = n => { const i = ARG.indexOf(n); return i >= 0 ? ARG[i + 1] : undefined; };
const readJson = f => { try { return JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8')); } catch { return null; } };
const HAND = readJson('./judgments.json') || {};
const CACHED = readJson('./judgments.model.json') || {};
const JUDGE_MODEL = flag('--judge-model') || process.env.CITEKIT_JUDGE_MODEL || '';
const JUDGE_KEY = flag('--llm-key') || process.env.CITEKIT_API_KEY || '';
const overrideOf = (qid, id) => HAND[qid]?.[id] ?? CACHED[qid]?.[id];
const modelJudging = Boolean(JUDGE_MODEL && JUDGE_KEY);
const modelOut = {};

/* ---------- DOM stub ---------- */
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
global.alert = () => {}; global.confirm = () => true; global.prompt = () => null;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k,v) => { store[k]=String(v); }, removeItem: k => { delete store[k]; } };
global.DOMParser = class { parseFromString(xml){
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => { const i = m[1]; const g = re => (i.match(re)||[])[1]||'';
    const tag = [...i.matchAll(/<link\b[^>]*>/g)].map(x=>x[0]).find(t=>/title="pdf"/.test(t))||'';
    const pdf = (tag.match(/href="([^"]+)"/)||[])[1]||'';
    return { querySelector: sel => ({ textContent: sel==='title'?g(/<title>([\s\S]*?)<\/title>/):sel==='summary'?g(/<summary>([\s\S]*?)<\/summary>/):sel==='published'?g(/<published>([\s\S]*?)<\/published>/):'', getAttribute: () => (sel.startsWith('link')?pdf:null) }), querySelectorAll: () => [] }; });
  return { querySelectorAll: sel => (sel==='entry'?entries:[]) }; } };
global.URL.createObjectURL = () => 'blob:x'; global.URL.revokeObjectURL = () => {};
new Function('window', 'location', src)(global.window, global.location);
const LL = global.window.LL;
await new Promise(r => setTimeout(r, 30));

/* ---------- fetch the real pool, once per query ---------- */
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
  ['EuropePMC', q_ => LL.searchEPMC(q_, { per: 20 })],
  ['ERIC', q_ => LL.searchERIC(q_, { per: 20 })],
  ['DOAJ', q_ => LL.searchDOAJ(q_, { per: 20 })],
  ['PubMed', q_ => LL.searchPubMed(q_, { per: 20 })],
  ['arXiv', q_ => LL.searchArxiv(q_, { per: 20 })]
];

/* ---------- the variants under comparison ---------- */
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

const VARIANTS = {
  'v1-recency+consensus (rejected)': (r, qT) => {
    const lex = LL.rankScore(r, qT).lex;
    const consensus = Math.min(Math.max(0, (r._also?.length || 1) - 1), 4) / 4;
    const age = r.year ? Math.max(0, Math.min(1, (r.year - 1990) / 36)) : 0;
    return 1.0 * lex + 0.26 * consensus + 0.12 * Math.min(Math.log10(1 + (r.citations || 0)), 4) / 4 + 0.06 * (r.pdf ? 1 : 0) + 0.05 * age;
  },
  'legacy (abstract-only)': (r, qT) => scorePage(r.abstract || '', qT) + Math.log(1 + (r.citations || 0)) * 0.05,
  'current (lex+cites+readable)': (r, qT) => LL.rankScore(r, qT).score
};

/* ---------- graded relevance rubric ---------- */
function grade(rec, spec) {
  const title = (rec.title || '').toLowerCase();
  const abs = (rec.abstract || '').toLowerCase();
  const core = spec.core.map(c => c.toLowerCase());
  const inTitle = core.filter(c => title.includes(c)).length;
  const inAbs = core.filter(c => abs.includes(c)).length;
  if (inTitle >= 2) return 3;
  if (inTitle + inAbs >= 2 && inTitle >= 1) return 2;
  if (inTitle + inAbs >= 2) return 2;
  if (inTitle + inAbs === 1) return 1;
  return 0;
}
/* A stricter judge than the rubric, using whatever model the caller configured. Stingy on
 * purpose: an assessor that calls everything relevant reproduces the rubric's blind spot. */
async function modelGrade(rec, spec) {
  const prompt = `Search query: ${spec.query}

Document:
Title: ${rec.title}
Venue: ${rec.venue || '—'} (${rec.year || 'n.d.'})
Abstract: ${(rec.abstract || '(no abstract)').slice(0, 900)}

How relevant is this document to the search query? Reply with exactly one digit:
3 = directly on topic
2 = related and potentially useful
1 = tangentially related
0 = off topic`;
  let acc = '';
  try {
    await LL.callLLM('You are a strict information-retrieval relevance assessor. Assume a document is NOT fully relevant unless it clearly is. Reply with a single digit and nothing else.', prompt, d => { acc += d; });
  } catch { return null; }
  const m = String(acc).match(/[0-3]/);
  return m ? +m[0] : null;
}

const gain = rel => Math.pow(2, rel) - 1;
function ndcg(ranked, judgments, k) {
  const dcg = arr => arr.slice(0, k).reduce((a, r, i) => a + gain(judgments.get(r.id) ?? 0) / Math.log2(i + 2), 0);
  // ideal: sort the graded values directly — routing them through an id lookup returns
  // undefined for every fake id, which silently zeroes IDCG and hence the whole metric.
  const ideal = [...judgments.values()].sort((a, b) => b - a)
    .slice(0, k).reduce((a, g, i) => a + gain(g) / Math.log2(i + 2), 0);
  return ideal > 0 ? dcg(ranked) / ideal : 0;
}
const precisionAt = (ranked, judgments, k, minRel = 2) =>
  ranked.slice(0, k).filter(r => (judgments.get(r.id) ?? 0) >= minRel).length / k;

/* bpref (Buckley & Voorhees): built for exactly this situation — a pool where unjudged
 * documents are assumed non-relevant and the judgment set is incomplete and biased toward
 * whatever the systems already returned. It counts how often judged-relevant documents rank
 * above judged-non-relevant ones, so it degrades gracefully where nDCG does not. */
function bpref(ranked, judgments, minRel = 2) {
  const relevant = [...judgments.entries()].filter(([, g]) => g >= minRel).map(([id]) => id);
  const nonrel = new Set([...judgments.entries()].filter(([, g]) => g < minRel).map(([id]) => id));
  // With no judged non-relevant document there is nothing to penalise against, and the
  // formula divides by zero. Returning 0 there would read as "total failure" when the truth
  // is "not applicable" — return null and let the report exclude the query.
  if (!relevant.length || !nonrel.size) return null;
  const order = ranked.map(r => r.id);
  const denom = Math.min(relevant.length, nonrel.size);
  let sum = 0;
  for (const rid of relevant) {
    const pos = order.indexOf(rid);
    const above = pos < 0 ? nonrel.size : order.slice(0, pos).filter(id => nonrel.has(id)).length;
    sum += 1 - above / denom;
  }
  return sum / relevant.length;
}

/* ---------- run ---------- */
const K = 8;
const rows = [];
const allJudgments = {};
for (const spec of QUERIES) {
  const qT = terms(spec.query);
  const raw = [];
  for (const [name, fn] of SOURCES) {
    try { (await fn(spec.query)).forEach(r => raw.push(r)); } catch { /* source unavailable */ }
  }
  let pool = LL.dedupe(raw).filter(r => r.title && r.title !== '(untitled)');
  pool = await LL.enrichWithOpenAlex(pool).catch(() => pool);

  // depth-k pool across all variants -> judge the union
  const pooled = new Map();
  for (const [name, fn] of Object.entries(VARIANTS)) {
    [...pool].sort((a, b) => fn(b, qT) - fn(a, qT)).slice(0, K).forEach(r => pooled.set(r.id, r));
  }
  const judgments = new Map();     // the effective judge
  const rubricJudge = new Map();   // rubric only, kept so the delta stays visible
  const docs = [];
  for (const [id, r] of pooled) {
    const rb = grade(r, spec);
    rubricJudge.set(id, rb);
    let g = overrideOf(spec.id, id);
    if (g === undefined && modelJudging) {
      g = await modelGrade(r, spec);
      if (g !== null) (modelOut[spec.id] ||= {})[id] = g;
    }
    judgments.set(id, g === undefined ? rb : g);
    docs.push({ id, grade: judgments.get(id), rubric: rb, title: r.title, year: r.year || null,
                venue: r.venue || '', source: r.source || '', citations: r.citations || 0,
                abstract: (r.abstract || '').slice(0, 600) });
  }
  allJudgments[spec.id] = { query: spec.query, split: spec.split, judged: judgments.size,
                            grades: [...judgments.values()], rubricGrades: [...rubricJudge.values()], docs };

  const metrics = (fn, jm) => {
    const ranked = [...pool].sort((a, b) => fn(b, qT) - fn(a, qT)).slice(0, K);
    return { ndcg: ndcg(ranked, jm, K), bpref: bpref(ranked, jm), p5: precisionAt(ranked, jm, 5), p8: precisionAt(ranked, jm, 8) };
  };
  const result = { id: spec.id, split: spec.split, pool: pool.length, judged: judgments.size, rubricOnly: {} };
  for (const [name, fn] of Object.entries(VARIANTS)) {
    result[name] = metrics(fn, judgments);
    result.rubricOnly[name] = metrics(fn, rubricJudge);
  }
  rows.push(result);
}
relay.close();

/* ---------- report ---------- */
const mean = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / arr.length;
const show = (label, subset) => {
  if (!subset.length) return;
  console.log(`\n${label} (${subset.length} queries, ${subset.reduce((a, r) => a + r.judged, 0)} pooled judgments)`);
  console.log('  variant                          nDCG@8   bpref    P@5     P@8    [rubric-only nDCG]');
  for (const name of Object.keys(VARIANTS)) {
    const bv = subset.map(r => r[name].bpref).filter(v => v !== null);
    const b = bv.length ? (bv.reduce((a, x) => a + x, 0) / bv.length).toFixed(3) : ' n/a ';
    console.log(`  ${name.padEnd(30)} ${mean(subset, r => r[name].ndcg).toFixed(3)}   ${b}   ${mean(subset, r => r[name].p5).toFixed(3)}   ${mean(subset, r => r[name].p8).toFixed(3)}      ${mean(subset, r => r.rubricOnly[name].ndcg).toFixed(3)}`);
  }
  const excluded = subset.filter(r => r[Object.keys(VARIANTS)[0]].bpref === null).length;
  if (excluded) console.log(`  (bpref n/a for ${excluded}/${subset.length} queries — no judged non-relevant document to rank against)`);
};
console.log('Per-query nDCG@8:');
for (const r of rows) {
  console.log(`  ${r.id.padEnd(4)} ${r.split.padEnd(5)} pool=${String(r.pool).padStart(3)} judged=${String(r.judged).padStart(2)}  ` +
    Object.keys(VARIANTS).map(n => `${r[n].ndcg.toFixed(2)}`).join(' / '));
}
show('TRAIN split (weights were set here)', rows.filter(r => r.split === 'train'));
show('TEST split (held out — this is the number that counts)', rows.filter(r => r.split === 'test'));
console.log('\njudgments:', Object.values(allJudgments).reduce((a, j) => a + j.judged, 0),
  'pooled documents graded 0-3 by the EFFECTIVE judge (hand adjudication where it exists, else the rubric in tests/queries.json)');
{ // grade distribution: if nearly everything is a 2 or 3, the judge cannot discriminate
  const hist = [0, 0, 0, 0];
  Object.values(allJudgments).forEach(j => j.grades.forEach(g => hist[g]++));
  const total = hist.reduce((a, b) => a + b, 0);
  console.log('grade distribution (effective judge): ' + hist.map((n, i) => `${i}:${n} (${Math.round(100 * n / total)}%)`).join('  '));
  if (hist[2] + hist[3] > total * 0.85)
    console.log('  ⚠ >85% of pooled docs still grade >=2. Only part of that is leniency in the judge:\n' +
                '    a depth-8 pool is drawn from systems that already return good results, so it holds few\n' +
                '    non-relevant documents BY CONSTRUCTION. Deeper pooling would discriminate more than a\n' +
                '    stricter judge alone — which is also why bpref is n/a wherever nothing was judged <2.');
}
console.log('variants in column order: ' + Object.keys(VARIANTS).join(' / '));
{ // judge comparison: does the blunter measure actually change the answer?
  const eff = [0, 0, 0, 0], rub = [0, 0, 0, 0];
  Object.values(allJudgments).forEach(j => {
    j.grades.forEach(g => eff[g]++);
    j.rubricGrades.forEach(g => rub[g]++);
  });
  const lenient = h => Math.round(100 * (h[2] + h[3]) / Math.max(1, h.reduce((a, b) => a + b, 0)));
  console.log(`judge comparison: rubric grades >=2 for ${lenient(rub)}% of pooled docs; the effective judge grades >=2 for ${lenient(eff)}%`);
}
const dumpIdx = process.argv.indexOf('--judgments');
if (dumpIdx >= 0) {
  // NOTE: this must include the documents. An earlier version dumped only the grade arrays,
  // which made the output impossible to re-adjudicate — you could not see what was graded.
  const out = process.argv[dumpIdx + 1] || 'judgments.json';
  fs.writeFileSync(out, JSON.stringify(allJudgments, null, 2));
  console.log('wrote pooled documents + grades to ' + out);
}
if (Object.keys(modelOut).length) {
  fs.writeFileSync(new URL('./judgments.model.json', import.meta.url), JSON.stringify(modelOut, null, 2));
  console.log('cached model verdicts to tests/judgments.model.json (reused on later runs)');
}
