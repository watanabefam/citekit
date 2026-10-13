#!/usr/bin/env node
// Re-pool an existing dump at a different depth or strategy — OFFLINE, zero API calls.
//
// Why this exists: OpenAlex meters at $0.001/call against a $0.10/day anonymous budget, so
// "try a deeper pool and see" costs real quota. tests/eval-ranking.mjs now persists the full
// candidate set with every variant's score, which makes pooling depth and strategy analysis
// parameters rather than experiments. The only thing that is NOT free is judging the
// documents a deeper pool adds — so this reports that cost explicitly instead of hiding it
// behind the standard (and generous) "unjudged means non-relevant" assumption.
//
// Usage: node tests/pool-depth.mjs [dump.json] [--depths 8,12,20,40] [--selftest]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const selfTest = args.includes('--selftest');
const depthArg = args.includes('--depths') ? args[args.indexOf('--depths') + 1] : '8,12,20,40';
const DEPTHS = depthArg.split(',').map(Number).filter(n => n > 0).sort((a, b) => a - b);
const dumpArg = args.find(a => !a.startsWith('--') && a !== depthArg) || '/tmp/pool.json';

/* ---------- the two pooling strategies (kept in sync with eval-ranking.mjs) ---------- */
function depthPool(rankedLists, k) {
  const pool = new Map();
  for (const list of rankedLists) list.slice(0, k).forEach(d => pool.set(d.id, d));
  return pool;
}
function mtfPool(rankedLists, n) {
  const pool = new Map();
  const idx = rankedLists.map(() => 0);
  let progressed = true;
  while (pool.size < n && progressed) {
    progressed = false;
    for (let s = 0; s < rankedLists.length && pool.size < n; s++) {
      const list = rankedLists[s];
      while (idx[s] < list.length) {
        const doc = list[idx[s]++];
        if (!pool.has(doc.id)) { pool.set(doc.id, doc); progressed = true; break; }
      }
    }
  }
  return pool;
}

/* ---------- self-test: the pooling primitives, on a fixture, with no network ---------- */
if (selfTest) {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✓ ' + n + (x ? ' — ' + x : ''))) : (fail++, console.log('  ✗ ' + n + ' — ' + x)); };
  const mk = id => ({ id });
  const lists = [[mk('A'), mk('X'), mk('B')], [mk('C'), mk('D')], [mk('X'), mk('E')]];
  ok('fixed depth 1 takes exactly the head of each run', [...depthPool(lists, 1).keys()].join(',') === 'A,C,X', [...depthPool(lists, 1).keys()].join(','));
  ok('MTF walks runs in order, skipping already-pooled', [...mtfPool(lists, 4).keys()].join(',') === 'A,C,X,B', [...mtfPool(lists, 4).keys()].join(','));
  ok('MTF never exceeds the target size', mtfPool(lists, 2).size === 2, mtfPool(lists, 2).size + ' docs');
  ok('deeper depth pooling is a superset of shallower', depthPool(lists, 2).size >= depthPool(lists, 1).size);

  // The actual advantage, and the reason the strategy is worth having: when runs OVERLAP,
  // fixed depth spends its slots on documents several runs already contributed, so the pool
  // comes out SHORTER than requested. MTF keeps walking each run to reach the target size.
  const overlap = [[mk('A'), mk('X'), mk('B')], [mk('A'), mk('X'), mk('C')], [mk('A'), mk('X'), mk('D')]];
  const d1o = depthPool(overlap, 1), m3o = mtfPool(overlap, 3);
  // Assert the property, not a hand-traced expectation: earlier versions of this test asserted
  // specific ids and were wrong twice while the pooling code was correct both times.
  ok('with overlapping runs, fixed-depth-1 yields fewer documents than the target', d1o.size < 3, d1o.size + ' docs from 3 runs');
  ok('MTF reaches the requested size despite the overlap', m3o.size === 3, m3o.size + ' docs');
  ok('MTF therefore surfaces documents fixed-depth-1 never pools',
     [...m3o.keys()].some(k => !d1o.has(k)), 'MTF: ' + [...m3o.keys()].join(','));
  console.log(`\n=== pool-depth self-test: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

/* ---------- the real report ---------- */
if (!fs.existsSync(dumpArg)) {
  console.error(`no dump at ${dumpArg} — run: node tests/eval-ranking.mjs --judgments ${dumpArg}`);
  process.exit(1);
}
const dump = JSON.parse(fs.readFileSync(dumpArg, 'utf8'));
const HAND = JSON.parse(fs.readFileSync(path.join(HERE, 'judgments.json'), 'utf8'));
const queries = Object.entries(dump).filter(([, q]) => Array.isArray(q.candidates) && q.candidates.length);
if (!queries.length) {
  console.error('this dump predates candidate persistence — re-run the eval to regenerate it');
  process.exit(1);
}

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const graded = (qid, id) => HAND[qid]?.[id];
const listsFor = q => {
  const variants = Object.keys(q.candidates[0].scores);
  return { variants, lists: variants.map(v => [...q.candidates].sort((a, b) => b.scores[v] - a.scores[v])) };
};

// Per strategy: what does a pool of target size T contain, and how much of it is unjudged?
function measure(strategy, target) {
  const sizes = [], added = [], unjudged = [], cites = [], freshRanks = [];
  for (const [qid, q] of queries) {
    const { variants, lists } = listsFor(q);
    const base = depthPool(lists, 8);                       // the committed baseline
    const pool = strategy === 'mtf' ? mtfPool(lists, target) : depthPool(lists, target);
    sizes.push(pool.size);
    const fresh = [...pool.keys()].filter(id => !base.has(id));
    added.push(fresh.length);
    unjudged.push(fresh.filter(id => graded(qid, id) === undefined).length);
    for (const id of fresh) {
      const c = q.candidates.find(x => x.id === id);
      if (!c) continue;
      cites.push(c.citations || 0);
      // How far down the BEST variant does an added document sit? A count of "variants ranking
      // it in their top-8" is structurally always 0 here — anything outside the depth-8 pool is
      // outside all three top-8s by definition — so it measured nothing at all.
      const best = Math.min(...variants
        .map(v => [...q.candidates].sort((a, b) => b.scores[v] - a.scores[v]).findIndex(x => x.id === id) + 1)
        .filter(r => r > 0));
      freshRanks.push(Number.isFinite(best) ? best : 0);
    }
  }
  return {
    size: mean(sizes), added: mean(added), unjudged: mean(unjudged),
    medianCites: median(cites), medianBestRank: median(freshRanks),
    n: cites.length,
  };
}

// Is there citation data at all? Without OpenAlex enrichment (e.g. while rate-limited) most
// records carry no citation count, and a "median cites: 0" column would be a lie by omission.
const all = queries.flatMap(([, q]) => q.candidates);
const withCites = all.filter(c => (c.citations || 0) > 0).length;
const citeCoverage = all.length ? withCites / all.length : 0;

console.log(`\nPool-depth analysis from ${dumpArg} (no API calls)`);
console.log(`${queries.length} queries · ${all.length} candidates persisted with per-variant scores`);
if (citeCoverage < 0.25)
  console.log(`⚠ only ${Math.round(100 * citeCoverage)}% of candidates carry a citation count — OpenAlex enrichment did not run\n  (rate limit), so the citation column below is NOT informative in this dump.`);

console.log('\nEqual adjudication cost: a fixed-depth-8 pool is NOT the same size as an MTF pool of 8.');
console.log('Each block compares the two strategies at the SAME number of documents per query.\n');
console.log('target   strategy   pool/query   added vs depth-8   unjudged   median best-variant rank');
for (const d of DEPTHS) {
  const dp = measure('depth', d);
  // MTF at the size fixed-depth actually produced, so the two rows are equal-cost
  const mp = measure('mtf', Math.round(dp.size));
  for (const [name, r] of [['depth', dp], ['mtf', mp]]) {
    const tag = d === DEPTHS[0] && name === 'depth' ? '   ← committed baseline' : '';
    console.log(`${String(Math.round(dp.size)).padStart(6)}   ${name.padEnd(9)}  ${r.size.toFixed(1).padStart(10)}   ${r.added.toFixed(1).padStart(16)}   ${r.unjudged.toFixed(1).padStart(8)}   ${String(r.medianBestRank).padStart(23)}${tag}`);
  }
}

const base = measure('depth', 8);
console.log(`\nJudgment cost of depth: going from ~${base.size.toFixed(0)} to ~${measure('depth', DEPTHS[DEPTHS.length - 1]).size.toFixed(0)} documents per query`);
console.log(`adds ~${measure('depth', DEPTHS[DEPTHS.length - 1]).added.toFixed(0)} more relevance judgments PER QUERY —`);
console.log(`about ${Math.round(queries.length * measure('depth', DEPTHS[DEPTHS.length - 1]).added)} across this 12-query set, and every one of them`);
console.log(`is a document the current ranking variants did not already surface.`);
console.log(`\nHand grades exist for ${Object.values(HAND).reduce((a, v) => a + Object.keys(v).length, 0)} documents; anything outside that set falls`);
console.log(`back to the lenient rubric, or to "unjudged = non-relevant". Both are stated rather than`);
console.log(`silently applied, because which you pick is exactly what is being measured.`);
