#!/usr/bin/env node
// fidelity.mjs — four integrity checks CiteKit did not previously run.
//
// Why this exists. A downstream document built from CiteKit searches contained six defects.
// Every one was invisible to retrieval: the searches were good, the ranking was good, and the
// claims were still wrong. Two published base rates say that is normal, not careless —
// Jergas & Baethge (2015, PeerJ, 28 studies) put the MAJOR quotation error rate at 11.9%
// [95% CI 8.4-...], and Martella et al. (2021, Review of Educational Research 91(2):272-308),
// analysing 1,630 assertions across 1,090 articles citing Freeman et al. (2014), found 26.01%
// unsupported and 34.77% of ARTICLES carrying at least one unsupported assertion.
//
// The four checks, each addressing a distinct failure:
//   1. retraction      — is this record retracted, withdrawn, corrected, or a notice of one?
//   2. attribution     — does this record's abstract report other people's findings?
//   3. claim scope     — is this a primary study or a synthesis of others?
//   4. draft audit     — does YOUR prose relay a finding it read second-hand?
//
// Checks 1-3 are pure functions over already-fetched payloads, so the tests need no network.
// The network layer is thin and separate.
//
// Design rule borrowed from the repo: no second implementation to drift. Where CiteKit already
// normalises a record, use LL.openAlexToRecord via tools/load-ll.mjs rather than re-deriving it.
//
// Usage:
//   node tools/fidelity.mjs doi 10.1378/chest.128.6.3817     # retraction + scope for one DOI
//   node tools/fidelity.mjs draft ../family/habits/prayer.md # audit a draft's prose
//   node tools/fidelity.mjs draft FILE --strict              # exit 1 on any HARD relay

import { createRequire } from 'node:module';
import { loadLL } from './load-ll.mjs';

// `require` does not exist in an ES module, and a bare require inside a try/catch fails silently —
// which is how the first version of the key-file fallback never worked at all.
const requireSync = createRequire(import.meta.url);

/* ============================ vocabularies ============================ */

const YEAR = String.raw`(?:19|20)\d{2}`;
const NAME = String.raw`[A-Z][A-Za-z'\u2019-]+`;

// "Bengtson et al. 2013" / "Vermeer, Janssen & Scheepers 2012" / "Dollahite and Marks, 2017"
const CITE_SCHOLAR = new RegExp(
  String.raw`(${NAME}(?:\s*(?:,\s*${NAME})?)?(?:\s*(?:&|and|,)\s*${NAME})?(?:\s+et\s+al\.?)?)\s*[,(]?\s*(${YEAR})`,
  'g'
);

// Institution form: this is how the abstract that caused four of the six defects attributed
// two Pew figures — "the Pew Research Center found…", with no year and no surname.
const INST_NOUN = String.raw`(?:Center|Centre|Institute|Council|Organization|Organisation|Association|Department|Foundation|Bureau|Survey|Board|Service|Commission|Ministry|University|College|Society|Federation|Agency|Office)`;
const CITE_INST = new RegExp(String.raw`\b((?:the\s+)?(?:${NAME}\s+){1,4}${INST_NOUN})\b`, 'g');

// A clause reporting someone else's finding rather than the authors' own.
const ATTRIB_VERB = /\b(found|reported|showed|suggested|argued|concluded|observed|noted|demonstrated|according to|consistent with|as reported|has suggested|estimated|surveyed)\b/i;
// The authors' own result — must not be counted as second-hand.
const OWN_WORK = /\b(we\s+(?:found|report|show|argue|suggest|examine|examines|used|use|sought|investigate|code|review)|this (?:study|paper|article|research)|our (?:findings?|results?|analysis|data|study|sample)|in our|the (?:present|current)\s+study)\b/i;

// Prose that announces it is relaying. This is the high-precision signal: a sentence that says
// "as reported by" is telling you it did not read the original.
const RELAY = /\b(as reported (?:by|in)|reported (?:by|in)|quoted (?:in|by)|summari[sz]ed (?:by|in)|second-?hand|carried from)\b/i;
// "according to" only counts when it names a source, not in "according to our own will".
const ACCORDING = /\baccording to\s+(?:the\s+)?[A-Z]/;

// Not attributions: these are labels that take a year.
const NOT_A_NAME = new Set(['Figure','Table','Section','Article','Chapter','Box','Appendix','Act','Note','Item','Rule','Part','Paragraph','Equation','Vol','No','Page','Version','Stage','Cycle','Grade','Level','Phase','Box','Model','Test','Wave','Round','Trial']);

// A clause that narrows an aggregate finding to a component — Martella et al.'s dominant
// unsupported category (16.93% of assertions): citing an overall effect to support a specific
// method the synthesis never compared.
const SPECIFIER = /\b(specifically|in particular|namely|especially|particularly|driven by|due to|because of the use of)\b/i;

// A cited figure. Every one of these is a prompt to confirm the number was read at source and
// not lifted from a summary — which is how all four dated/numeric defects in the prayer document
// arose (Pew 44%, Pew 78%, Bengtson 3,000, Lally median 66). Deliberately high-recall, low-
// precision, and therefore ADVISORY only: it never fails a build.
const FIGURE = /(?:\d[\d,.]*\s*(?:%|per cent|percent)|[drg]\s*=\s*[−-]?\d|\b\d[\d,.]*\s+(?:studies|participants|articles|assertions|families|youth|students|papers|experiments|volunteers)\b)/i;

// Severity order for update-to types. `update-to` is not guaranteed chronological, so a DOI with
// both a retraction and a correction must be labelled by the most severe.
const SEVERITY = ['retraction', 'withdrawal', 'removal', 'expression_of_concern', 'correction'];

// A sentence that DECLARES its own provenance status has already done what HARD is asking for.
// The word that matters is a STATUS word ("second-hand", "abstract only", "not read"), not a ROUTE
// word ("quoted in", "via") — a route tells the reader where the claim came from, which is not the
// same as telling them how far it was verified. Without this, the tool penalises honesty: the
// audited prayer document's frank "second-hand citation (Hansen 1998, via Dollahite)" fails
// --strict, which would push an author toward deleting the disclosure rather than the error.
const RESOLVED = /\b(verified at (?:source|primary)|read at (?:primary|full text|source)|primary source|abstract only|not read|body not read|book not read|reported-not-verified|unverified|second-?hand|summari[sz]ed in `)/i;

// OpenAlex work types that are themselves notices rather than works. Probed 2026-10-29:
// the Wakefield retraction notice (10.1016/S0140-6736(10)60175-4) returns type "retraction"
// AND is_retracted: true. So `is_retracted` alone is ambiguous — it means "this IS a notice"
// for a notice, and "this WAS retracted" for a work. Type disambiguates; without this branch
// the tool tells you a retraction notice was retracted.
const NOTICE_TYPES = new Set(['retraction', 'erratum']);

// Abbreviations whose full stop is not a sentence boundary. Splitting on "et al." silently
// destroys the most common scholarly attribution form, which is how the first version of this
// detector scored zero on the very abstract it was written for.
const ABBREV = /\b(al|e\.g|i\.e|vs|etc|cf|Fig|Figs|No|Vol|pp|ed|eds|approx|ca|resp)\.\s/g;

/* ============================ 1. retraction ============================ */

// Probed, not assumed (2026-10-29):
//   - 10.1378/chest.128.6.3817 (retracted 2008): Crossref carries NO update-to, NO updated-by,
//     NO relation. Only the title prefix "RETRACTED:". OpenAlex has is_retracted: true.
//   => a Crossref-only check MISSES it. Title-prefix detection is load-bearing, not decorative.
//   - 10.1016/S0140-6736(10)60175-4 (the Wakefield notice): Crossref update-to [{type:'retraction',
//     source:'retraction-watch'}]. So update-to lives on the NOTICE, and may carry Retraction Watch
//     provenance rather than the publisher's.
//   - OpenAlex `type` distinguishes 'review' from 'article', which check 3 depends on.
//
// Consequence: never report absence as safety. The honest answer is "no retraction on record",
// with the timestamp, because coverage depends on the publisher and on Retraction Watch's feed.
export function classifyRetraction({ crossref = null, openalex = null, checkedAt = null } = {}) {
  const evidence = [];
  let noticeType = null;
  let noticeDoi = null;
  let status = 'no-retraction-on-record';
  let source = null;

  const cr = crossref?.message || crossref || null;

  if (cr) {
    // (a) the work carries a link to a retraction of it
    const rel = cr.relation || {};
    for (const key of ['is-retracted-by', 'is-withdrawn-by', 'is-corrected-by']) {
      if (Array.isArray(rel[key]) && rel[key].length) {
        evidence.push(`crossref:relation.${key}`);
        const doi = rel[key][0]?.id || rel[key][0]?.DOI || null;
        if (doi) noticeDoi = String(doi).replace(/^https?:\/\/doi\.org\//i, '');
        if (key !== 'is-corrected-by') status = 'retracted';
        source = source || 'crossref';
      }
    }
    // (b) publisher prepended the status to the title
    const title = (cr.title || [])[0] || '';
    if (/^\s*(retracted|withdrawn)\b/i.test(title)) {
      evidence.push('crossref:title-prefix');
      status = 'retracted';
      source = source || 'crossref';
    }
    // (c) this DOI is itself a notice — record the type, but a notice is not the work
    const ut = cr['update-to'];
    if (Array.isArray(ut) && ut.length) {
      const types = ut.map(u => String(u.type || '').toLowerCase()).filter(Boolean);
      // `update-to` order is not guaranteed chronological; prefer the most severe.
      const chosen = SEVERITY.find(s => types.some(t => t.includes(s.split('_')[0]))) || types[0] || null;
      if (chosen) {
        noticeType = chosen;
        noticeDoi = noticeDoi || ut[0]?.DOI || null;
        evidence.push(`crossref:update-to(${chosen}${ut[0]?.source ? ',' + ut[0].source : ''})`);
        source = source || (ut[0]?.source || 'crossref');
        if (status === 'no-retraction-on-record') status = 'is-a-notice';
      }
    }
  }

  // (d) OpenAlex's flag needs the type to interpret: on a notice, is_retracted means "this is
  // a notice", not "this was retracted".
  if (openalex && typeof openalex === 'object') {
    const oaType = String(openalex.type || '').toLowerCase();
    if (NOTICE_TYPES.has(oaType)) {
      // The type says "this is a notice". is_retracted is then about the notice, not about a
      // work being retracted — so it must not be read as one. Note this branch precedes the
      // is_retracted branch deliberately; as an else-if it would be shadowed and mislabel every
      // retraction notice as a retracted work.
      evidence.push(`openalex:type=${oaType}`);
      noticeType = noticeType || oaType;
      source = source || 'openalex';
      if (status !== 'retracted') status = 'is-a-notice';
    } else if (openalex.is_retracted === true) {
      evidence.push('openalex:is_retracted');
      status = 'retracted';
      source = source || 'openalex';
    }
  }

  if (!cr && !openalex) status = 'not-checked';

  return {
    status,                       // retracted | is-a-notice | no-retraction-on-record | not-checked
    noticeType,
    noticeDoi,
    evidence,
    source,
    checkedAt: checkedAt || new Date().toISOString(),
    // the honest caveat, carried in the payload so a summarising agent cannot drop it
    caveat: status === 'no-retraction-on-record'
      ? 'No retraction-related field found as of the timestamp. Coverage depends on the publisher and on Retraction Watch; absence is not proof the work is clean.'
      : null,
  };
}

/* ============================ 2. attribution ============================ */

// Does this abstract report findings that belong to other people? Clause-scoped, so an
// attribution verb in one clause does not taint the authors' own result in another.
export function detectAttributions(abstract = '') {
  const text = String(abstract || '').replace(/\s+/g, ' ').trim();
  if (!text) return { attributions: [], density: 0, flag: 'no-abstract', selfReport: false };

  // Protect abbreviations so the clause splitter does not break "Smith et al. 2001" in two.
  // \u0001 stands in for the full stop; restored immediately after splitting.
  const guarded = text.replace(ABBREV, (m) => m.replace('.', '\u0001'));
  const clauses = guarded.split(/(?<=[.;:])\s+/).map(c => c.replace(/\u0001/g, '.'));

  const found = new Map();
  for (const clause of clauses) {
    const attrib = ATTRIB_VERB.test(clause) || ACCORDING.test(clause);
    if (!attrib) continue;
    if (OWN_WORK.test(clause) && !ACCORDING.test(clause)) continue;

    for (const m of clause.matchAll(CITE_SCHOLAR)) {
      if (NOT_A_NAME.has(m[1])) continue;
      if (!/[A-Za-z]{2,}/.test(m[1])) continue;
      const key = `${m[1].replace(/^the\s+/i, '').trim()} ${m[2]}`;
      if (!found.has(key)) found.set(key, { cite: key, form: 'scholarly', clause: clause.slice(0, 190) });
    }
    for (const m of clause.matchAll(CITE_INST)) {
      const inst = m[1].replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim();
      if (!found.has(inst)) found.set(inst, { cite: inst, form: 'institutional', clause: clause.slice(0, 190) });
    }
  }

  const attributions = [...found.values()];
  const density = attributions.length;
  return {
    attributions,
    density,
    selfReport: OWN_WORK.test(text),
    flag: density >= 2 ? 'summarises-others' : density === 1 ? 'one-attribution' : 'none-detected',
  };
}

/* ============================ 3. claim scope ============================ */

// Primary study, or a synthesis of other people's studies? Uses OpenAlex `type` (verified to
// return 'review' for the story systematic review and 'article' for the empirical papers),
// the title, and the attribution density above.
export function claimScope(record = {}) {
  const type = String(record.type || '').toLowerCase();
  const title = String(record.title || '').toLowerCase();
  const { flag, density } = detectAttributions(record.abstract);

  if (/^(review|meta-?analysis|editorial|commentary|letter|erratum)$/.test(type)) {
    return { scope: 'secondary', why: `OpenAlex type is "${type}"`, density };
  }
  if (/\b(systematic review|meta-analys[ie]s|a review|review of|overview|scoping review)\b/.test(title)) {
    return { scope: 'secondary', why: 'title states it is a review or meta-analysis', density };
  }
  if (flag === 'summarises-others') {
    return { scope: 'secondary?', why: `abstract attributes findings to ${density} other sources`, density };
  }
  if (flag === 'one-attribution') {
    return { scope: 'mixed?', why: 'one second-hand attribution in the abstract', density };
  }
  return { scope: 'primary?', why: 'no second-hand attribution detected', density };
}

/* ============================ 4. draft audit ============================ */

// How many SEPARATE parenthetical groups carry a citation. One group with a semicolon list,
// "(Calvert & Tart 1993; Rainey & Larsen 2002)", is a citation list — not a relay.
function citationGroups(sentence) {
  const groups = [];
  for (const m of sentence.matchAll(/\(([^()]*)\)/g)) {
    if (new RegExp(String.raw`${NAME}[^()]{0,40}${YEAR}`).test(m[1])) groups.push(m[1]);
  }
  return groups;
}

export function auditSentence(sentence, { scope = null } = {}) {
  const s = String(sentence || '');
  // ignore author-year pairs inside inline code
  const bare = s.replace(/`[^`]*`/g, ' ');

  const cites = [];
  for (const m of bare.matchAll(CITE_SCHOLAR)) {
    if (NOT_A_NAME.has(m[1])) continue;
    cites.push(`${m[1]} ${m[2]}`);
  }
  const uniq = [...new Set(cites)];
  const relay = RELAY.exec(bare);
  const according = ACCORDING.test(bare) ? 'according to <named source>' : null;
  const groups = citationGroups(bare);

  const reasons = [];
  let level = null;
  const resolved = RESOLVED.test(bare);
  if (relay) { reasons.push(`relay marker "${relay[0]}"`); level = 'HARD'; }
  if (according) { reasons.push(according); level = 'HARD'; }
  // Declared provenance downgrades rather than silences: the claim is still second-hand, it is
  // just no longer undeclared.
  if (resolved && level === 'HARD') { reasons.push('provenance already declared in the sentence'); level = 'ADVISORY'; }
  if (groups.length >= 2) { reasons.push(`${groups.length} separate citation groups`); level = level || 'WARN'; }
  // A figure attached to a citation is always worth confirming at source, at any level already set.
  if (uniq.length && FIGURE.test(bare)) {
    reasons.push('cited figure — confirm the number was read at source, not from a summary');
    level = level || 'ADVISORY';
  }
  if (scope === 'secondary' && SPECIFIER.test(bare)) {
    reasons.push('cites a synthesis while narrowing to a specific cause/component');
    level = level || 'ADVISORY';
  }

  return { cites: uniq, groups: groups.length, relay: relay ? relay[0] : null, level, reasons };
}

export function auditDraft(markdown) {
  const lines = String(markdown || '').split('\n');
  const hard = [], warn = [], advisory = [];
  let considered = 0, inSources = false, inFence = false;
  let para = [];

  // Sentences must be assembled from a whole paragraph, not a whole line. Markdown prose is
  // hard-wrapped, so auditing line-by-line cuts sentences at the wrap and silently loses any
  // provenance note that fell on the next line — which is exactly what happened to the real
  // document this was written for.
  const flush = () => {
    if (!para.length) return;
    const text = para.join(' ').replace(/\s+/g, ' ').trim();
    para = [];
    for (const part of text.split(/(?<=[.!?])\s+(?=[A-Z"“(*])/)) {
      const t = part.trim();
      if (t.length < 40) continue;
      considered++;
      const a = auditSentence(t);
      if (!a.level) continue;
      (a.level === 'HARD' ? hard : a.level === 'WARN' ? warn : advisory).push({ sentence: t, ...a });
    }
  };

  for (const line of lines) {
    const raw = line.trim();
    if (/^```/.test(raw)) { flush(); inFence = !inFence; continue; }
    if (inFence) continue;
    if (!raw) { flush(); continue; }
    if (/^#{1,6}\s/.test(raw)) {
      flush();
      // the Sources block is a bibliography, not prose — stop auditing at it
      if (/^#{1,6}\s+\**\s*sources\b/i.test(raw)) inSources = true;
      continue;
    }
    if (inSources) continue;
    if (raw.startsWith('|')) { flush(); continue; }          // table row

    para.push(raw.replace(/^(?:>\s*)+/, '').replace(/^(?:[-*]|\d+\.)\s+/, ''));
  }
  flush();

  return { considered, hard, warn, advisory, flagged: hard.length + warn.length + advisory.length };
}

/* ============================ 5. claim ledger ============================ */

// A ledger of what you actually read, per claim. The control the draft audit cannot be:
// the audit catches claims that ANNOUNCE they are second-hand; the ledger catches claims that
// are second-hand quietly, which is how "median 66 days" (body text, abstract read) and an
// unverified effect size both got in.
//
// Vocabulary borrowed from two places, deliberately:
//   - SEPIO (Scientific Evidence and Provenance Information Ontology): an assertion's identity is
//     (proposition, agent, occasion) — so a record carries who asserted it and when. And evidence
//     is counted in EVIDENCE LINES, not citations: two claims drawn from one paper are one line.
//     That is the false-corroboration error in the document this tooling came from, where
//     "Hansen, the Pew figures and Dollahite" read as three supports and was one paper read.
//   - SciFact / SCIVER (Wadden et al., EMNLP 2020): the verdict vocabulary is
//     SUPPORTS / REFUTES / NOT_ENOUGH_INFO. Its leaderboard tops out near 46% F1, so this tool
//     never predicts a verdict. It records the one a human made, and refuses to accept a
//     "supports" on evidence that was never opened.

// Ordered worst-last. `full-text` means the work's own body was read.
export const ACCESS = ['full-text', 'abstract', 'via-secondary', 'not-read'];
const ACCESS_RANK = { 'full-text': 3, abstract: 2, 'via-secondary': 1, 'not-read': 0 };

export const VERDICTS = ['supports', 'refutes', 'not-enough-info', 'unclear'];

export function normaliseClaim(s) {
  // Identity must not depend on case, spacing or punctuation: "claim" and "Claim!" are the same
  // proposition, and a key that changes when a full stop is added cannot be looked up.
  return String(s || '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function claimKey(s) {
  const n = normaliseClaim(s);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < n.length; i++) {
    h1 ^= n.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 * 31 + n.charCodeAt(i)) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).slice(0, 12);
}

// Build a record. Defaults are deliberately conservative: access defaults to the WORST truthful
// value, so forgetting to state it fails closed rather than open.
export function ledgerRecord({
  claim, source = {}, access = 'not-read', via = null,
  verdict = 'unclear', loadBearing = false, agent = 'draft', at = null,
} = {}) {
  if (!ACCESS.includes(access)) throw new Error(`access must be one of ${ACCESS.join(' | ')}`);
  if (!VERDICTS.includes(verdict)) throw new Error(`verdict must be one of ${VERDICTS.join(' | ')}`);
  const evidenceLine = source.evidenceLine
    || source.doi
    || [source.authorYear, source.year].filter(Boolean).join('-')
    || null;
  return {
    key: claimKey(claim),
    claim: String(claim || '').trim(),
    asserted_by: agent,
    asserted_at: at || new Date().toISOString(),
    source: {
      doi: source.doi || null,
      author_year: source.authorYear || null,
      title: source.title || null,
    },
    access,
    via: via || null,                   // the secondary you actually read, if access is via-secondary
    evidence_line: evidenceLine,        // SEPIO: claims from one work are ONE line of evidence
    verdict,
    load_bearing: !!loadBearing,
  };
}

// Structured documents label their own evidence tiers — "**Research**, Dollahite 2019" is a tier
// label plus a citation, not an author called Research. Without these, every tier-labelled table
// row produced a phantom citation.
const CLASS_LABEL = new Set(['Research','Judgement','Judgment','Evidence','Church','Practice',
  'Application','Caveats','Limits','Summary','Implication','Implications','Takeaway',
  'Verdict','Notes','Note','Warning','Caution','Conclusion','Result','Finding','Findings']);

// Institution words that terminate a name phrase. "Pew Research Center (2009)" and
// "Congregation for the Clergy (1997)" are single authors; without this the scholarly regex
// captures only the final capitalised word ("Center", "Clergy") and every such citation then looks
// like an orphan because the Sources entry is filed under the full phrase.
const INST_WORD = new Set(['Center','Centre','Institute','Council','Organization','Organisation',
  'Association','Department','Foundation','Bureau','Survey','Board','Commission','Ministry',
  'University','College','Society','Federation','Agency','Office','Conference','Assembly','See']);

// Author-year pairs cited in a draft, for the cited-but-never-read and symmetry checks.
export function citedAuthorYears(markdown = '') {
  const out = [];
  const seen = new Set();
  const text = String(markdown).replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ');

  // Institution phrases first, so their spans can suppress the partial scholarly match inside them.
  const instSpans = [];
  for (const m of text.matchAll(CITE_INST)) {
    instSpans.push([m.index, m.index + m[1].length]);
    const after = text.slice(m.index + m[1].length, m.index + m[1].length + 12);
    const yr = /^\s*[,(]?\s*((?:19|20)\d{2})/.exec(after);
    const name = m[1].replace(/^the\s+/i, '').trim();
    if (!yr) continue;
    const key = `${name} ${yr[1]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, year: yr[1], label: `${name} ${yr[1]}`, words: nameWords(name) });
  }
  const insideInst = i => instSpans.some(([a, b]) => i >= a && i < b);

  for (const m of text.matchAll(CITE_SCHOLAR)) {
    if (insideInst(m.index)) continue;
    const captured = m[1].replace(/^the\s+/i, '').trim();
    const first = captured.split(/[ ,&]/)[0];
    if (NOT_A_NAME.has(first)) continue;
    if (CLASS_LABEL.has(first)) continue;
    if (INST_WORD.has(first)) continue;                    // handled by the institution pass
    // A capture that starts mid-list ("Babcock, Barrow & Rose (2019)", from
    // "Dollahite, Marks, Babcock, Barrow & Rose (2019)") is not the citation's surname. Detect it
    // by what precedes the match: a comma-separated capitalised name.
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (/(?:^|[.;:!?]\s+)[A-Z][A-Za-z'’-]+,\s+(?:and\s+)?$/.test(before)) continue;
    if (!/^[A-Z][A-Za-z'\u2019-]{2,}$/.test(first)) continue;
    const key = `${first} ${m[2]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: first, year: m[2], label: `${first} ${m[2]}`, words: nameWords(first) });
  }
  return out;
}

// Lowercase content words of a name, for overlap matching rather than exact string equality.
function nameWords(s) {
  return new Set(String(s || '').toLowerCase()
    .replace(/[*_`]/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w) && !/^[a-z]$/.test(w)));   // drop initials
}

// The gate. Pure: entries + optional draft text in, findings out.
export function auditLedger(entries = [], { draft = '' } = {}) {
  const failures = [], warnings = [];
  const fail = (e, why) => failures.push({ level: 'FAIL', why, claim: e.claim, source: e.source });
  const warn = (e, why) => warnings.push({ level: 'WARN', why, claim: e.claim, source: e.source });

  for (const e of entries) {
    const rank = ACCESS_RANK[e.access] ?? 0;

    // 1. cited but never accessed — the "Hansen 1998" class
    if (e.access === 'not-read') {
      fail(e, 'access is "not-read": cited without being opened at all');
      continue;
    }

    // 2. a figure stated from less than the full text — the "median 66 days" class
    if (FIGURE.test(e.claim) && rank < ACCESS_RANK['full-text']) {
      fail(e, `states a figure but access is "${e.access}" (a figure needs the work's own body)`);
    }

    // 3. load-bearing and read only through someone else's summary — the Dollahite class
    if (e.load_bearing && e.access === 'via-secondary') {
      fail(e, `load-bearing but seen only via ${e.via || 'a secondary'}`);
    }

    // 4. a verdict you could not have reached from an abstract
    if (e.verdict === 'supports' && rank < ACCESS_RANK['full-text']) {
      warn(e, `verdict "supports" recorded on access "${e.access}"`);
    }

    // 5. via-secondary without naming the secondary is untraceable
    if (e.access === 'via-secondary' && !e.via) {
      fail(e, 'access is "via-secondary" but no secondary is named');
    }
  }

  // 6. cited in the draft but absent from the ledger. This is a COMPLETENESS backlog, not a list of
  // errors, and conflating the two makes the gate unusable: a draft cites dozens of works and a
  // young ledger accounts for few. Reported separately, and it only fails a build with
  // --strict-incomplete. The substantive failures are checks 1-5.
  const unaccounted = [];
  if (draft) {
    const known = new Set(entries.flatMap(e => [
      String(e.source?.author_year || '').toLowerCase(),
      [e.source?.author_year, e.source?.title].filter(Boolean).join(' ').toLowerCase(),
    ]).filter(Boolean));
    const knownNames = [...known].join(' ');
    for (const c of citedAuthorYears(draft)) {
      const hit = known.has(c.label.toLowerCase()) || knownNames.includes(c.label.toLowerCase());
      if (!hit) unaccounted.push({ label: c.label });
    }
  }

  // SEPIO: corroboration is counted in evidence lines, not citations.
  const lines = new Set(entries.map(e => e.evidence_line).filter(Boolean));
  const readByMe = new Set(entries.filter(e => ACCESS_RANK[e.access] >= ACCESS_RANK['full-text']).map(e => e.evidence_line).filter(Boolean));

  return {
    failures, warnings, unaccounted,
    stats: {
      claims: entries.length,
      evidenceLines: lines.size,
      evidenceLinesReadAtFullText: readByMe.size,
      viaSecondary: entries.filter(e => e.access === 'via-secondary').length,
      loadBearing: entries.filter(e => e.load_bearing).length,
      unaccounted: unaccounted.length,
    },
  };
}

/* ============================ 5b. compact encoding ============================ */
// Measured on a realistic 100-claim ledger, tiktoken o200k_base:
//   verbose JSONL 13,474 tokens · compact JSON 6,015 (−55%) · pipe 4,645 (−66%)
//   · markdown table 5,313 (−61%) · the REPORT alone 125 (−99%)
// The lesson is that the encoding is the small lever and the interface is the large one: an agent
// should read the report, never the file. So: compact JSON is the STORE (no delimiter escaping to
// get wrong, extensible), and markdown/pipe are generated views for humans and prompts.
// Legacy verbose records are still read, so existing ledgers keep working.

const ACCESS_CODE = { 'full-text': 'F', abstract: 'A', 'via-secondary': 'S', 'not-read': 'N' };
const ACCESS_FROM = { F: 'full-text', A: 'abstract', S: 'via-secondary', N: 'not-read' };
const VERDICT_CODE = { supports: 'S', refutes: 'R', 'not-enough-info': 'N', unclear: '' };
const VERDICT_FROM = { S: 'supports', R: 'refutes', N: 'not-enough-info', '': 'unclear' };

export function encodeCompact(e) {
  const o = {
    k: e.key, c: e.claim,
    s: e.source?.author_year || e.source?.doi || '',
    a: ACCESS_CODE[e.access] || 'N',
    e: e.evidence_line || '',
  };
  if (e.source?.doi) o.d = e.source.doi;
  if (e.via) o.v = e.via;
  if (e.verdict && e.verdict !== 'unclear') o.x = VERDICT_CODE[e.verdict];
  if (e.load_bearing) o.l = 1;
  // agent and occasion live in the header, not on every row — SEPIO treats them as part of the
  // assertion's identity, but they are constant across one author's ledger.
  if (e.asserted_by && e.asserted_by !== LEDGER_DEFAULT_AGENT) o.by = e.asserted_by;
  if (e.asserted_at && e.asserted_at !== LEDGER_DEFAULT_AT) o.at = e.asserted_at;
  return o;
}

// An unknown verdict is not a verdict. Passing "MAYBE" through — or coercing it to something
// plausible — lets the ledger report a judgement nobody recorded, which is the failure this whole
// structure exists to prevent. Same for access: an unrecognised value defaults the claim to a
// confidence it was never given.
export function assertLedgerEnums(rec) {
  const vs = VERDICTS;
  if (!vs.includes(rec.verdict)) {
    throw new Error(`unknown verdict ${JSON.stringify(rec.verdict)} — must be one of ${vs.join('|')}`);
  }
  const legal = Object.values(ACCESS_FROM);
  if (!legal.includes(rec.access)) {
    throw new Error(`unknown access ${JSON.stringify(rec.access)} — must be one of ${legal.join('|')}`);
  }
  return rec;
}

export function decodeRecord(o) {
  // compact
  if (o.k !== undefined && o.claim === undefined) {
    return assertLedgerEnums({
      key: o.k, claim: o.c || '',
      asserted_by: o.by || LEDGER_DEFAULT_AGENT, asserted_at: o.at || LEDGER_DEFAULT_AT,
      source: { doi: o.d || null, author_year: o.s || null, title: null },
      access: ACCESS_FROM[o.a] || 'not-read',
      via: o.v || null, evidence_line: o.e || null,
      verdict: VERDICT_FROM[o.x ?? ''] || 'unclear',
      load_bearing: !!o.l,
    });
  }
  // legacy verbose
  return assertLedgerEnums({
    key: o.key, claim: o.claim || '',
    asserted_by: o.asserted_by || LEDGER_DEFAULT_AGENT, asserted_at: o.asserted_at || LEDGER_DEFAULT_AT,
    source: o.source || { doi: null, author_year: null, title: null },
    access: o.access || 'not-read', via: o.via || null,
    evidence_line: o.evidence_line || null,
    verdict: o.verdict || 'unclear', load_bearing: !!o.load_bearing,
  });
}

export const LEDGER_DEFAULT_AGENT = 'draft';
export const LEDGER_DEFAULT_AT = '';

// Generated view for humans and prompts. Markdown table measured at −61% against verbose JSONL.
export function ledgerToMarkdown(entries) {
  const rows = ['| key | access | source | line | verdict | lb | via | claim |', '|---|---|---|---|---|---|---|---|'];
  for (const e of entries) {
    rows.push('| ' + [
      e.key, ACCESS_CODE[e.access] || 'N', e.source?.author_year || e.source?.doi || '—',
      e.evidence_line || '—', VERDICT_CODE[e.verdict] || '—', e.load_bearing ? 'Y' : '',
      e.via || '', "'" + String(e.claim).replace(/\|/g, '/').replace(/\n/g, ' ') + "'",
    ].join(' | ') + ' |');
  }
  return rows.join('\n');
}

/* ============================ 5c. reconciliation ============================ */
// The gap: a ledger entry is keyed on its claim text, so editing the claim in the draft silently
// orphans the entry — it stops applying, and nothing says so. Closed by matching on similarity
// rather than identity, and reporting all three outcomes rather than only the happy path.

const STOPWORDS = new Set(('a an the and or but if of to in on at by for with from as is are was were be been '
  + 'being this that these those it its their his her our your we they he she not no than then so such').split(' '));

export function claimTokens(s) {
  return new Set(String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/)
    .filter(w => w && !STOPWORDS.has(w)));
}

// Jaccard says "these are the same claim"; containment says "one still contains the other", which
// is what a truncation or a one-clause edit looks like. Plain containment is dangerous on short
// claims though — a six-word claim whose words all appear in a long sentence scores 1.0, which
// produced a confident false match between "rewards d = -0.40" and an unrelated sentence. So
// containment is scaled by the length ratio: it only counts for what the two actually share.
export function similarity(a, b) {
  const A = claimTokens(a), B = claimTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(A.size, B.size);
  const ratio = Math.min(A.size, B.size) / Math.max(A.size, B.size);
  return 0.5 * jaccard + 0.5 * containment * ratio;
}

export const RECONCILE = { SAME: 0.75, DRIFTED: 0.45 };

// Surface similarity cannot distinguish "unchanged" from "inverted". Measured, both of these score
// above SAME (0.75) and were therefore filed as `matched` — the bucket that means nothing to see:
//   "(d = -0.40)" -> "(d = -0.04)"      0.804   an effect size off by a factor of ten
//   "44% left the faith" -> "44% kept"  0.774   the finding reversed
// A one-character edit that changes what a claim asserts must never inherit the old verdict, so
// `matched` additionally requires the load-bearing tokens to be identical: the numbers, the
// negation, and the direction words.
const NUMERIC = /-?\d+(?:[.,]\d+)*/g;
const NEGATORS = new Set(['not', 'no', 'never', 'none', 'without', 'cannot', 'nothing', 'neither', 'nor']);
const ANTONYMS = [
  ['helps', 'harms'], ['help', 'harm'], ['more', 'less'], ['more', 'fewer'], ['increase', 'decrease'],
  ['increases', 'decreases'], ['increased', 'decreased'], ['rise', 'fall'], ['rises', 'falls'],
  ['rose', 'fell'], ['higher', 'lower'], ['left', 'kept'], ['left', 'stayed'], ['supports', 'refutes'],
  ['support', 'refute'], ['better', 'worse'], ['positive', 'negative'], ['beneficial', 'detrimental'],
  ['always', 'never'], ['all', 'none'], ['stronger', 'weaker'], ['significant', 'insignificant'],
  ['increase', 'reduce'], ['increases', 'reduces'], ['increased', 'reduced'],
];

// Word-boundary test on the raw text, NOT on claimTokens(): that tokeniser drops short words, so
// "no" — the most common negation in English — was invisible to the first version of this check.
const hasWord = (s, w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(s);

export function claimDifferences(a, b) {
  const A = String(a || ''), B = String(b || '');
  const diffs = [];
  // Compare numeric literals as written. Normalising "3,500" to "3.500" made an English thousands
  // separator look like a European decimal point, and printing that invented value in the warning
  // is worse than saying nothing.
  const nums = s => (s.match(NUMERIC) || []).sort();
  const na = nums(A), nb = nums(B);
  if (na.join('|') !== nb.join('|')) {
    diffs.push(`number changed: [${na.join(', ') || '\u2014'}] \u2192 [${nb.join(', ') || '\u2014'}]`);
  }
  const neg = s => [...NEGATORS].filter(w => hasWord(s, w)).sort().join(', ');
  if (neg(A) !== neg(B)) diffs.push(`negation changed: [${neg(A) || '\u2014'}] \u2192 [${neg(B) || '\u2014'}]`);
  for (const [x, y] of ANTONYMS) {
    const aHasX = hasWord(A, x) && !hasWord(A, y), aHasY = hasWord(A, y) && !hasWord(A, x);
    const bHasX = hasWord(B, x) && !hasWord(B, y), bHasY = hasWord(B, y) && !hasWord(B, x);
    if ((aHasX && bHasY) || (aHasY && bHasX)) {
      diffs.push(`polarity flipped: ${aHasX ? x : y} \u2192 ${bHasX ? x : y}`);
    }
  }
  return [...new Set(diffs)];
}

export function reconcile(entries, draft) {
  // candidate claims from the draft: sentences and list items long enough to be a claim
  const candidates = [];
  for (const para of String(draft || '').split(/\n\s*\n/)) {
    const clean = para.replace(/^(?:>\s*)+/gm, '').replace(/^(?:[-*]|\d+\.)\s+/gm, '')
      .replace(/\|.*\|/g, ' ').replace(/\s+/g, ' ').trim();
    for (const s of clean.split(/(?<=[.!?])\s+(?=[A-Z"“(*])/)) {
      const t = s.trim();
      if (t.length >= 30 && !t.startsWith('#')) candidates.push(t);
    }
  }

  const matched = [], drifted = [], stale = [], seen = new Set();
  for (const e of entries) {
    let best = null, bestScore = 0;
    for (const c of candidates) {
      const s = similarity(e.claim, c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    // High surface similarity is necessary but not sufficient: a changed number or a flipped
    // direction is a DIFFERENT claim, however few characters it costs.
    const diffs = best ? claimDifferences(e.claim, best) : [];
    const score = +bestScore.toFixed(2);
    if (bestScore >= RECONCILE.SAME && !diffs.length) { matched.push({ entry: e, draft: best, score }); seen.add(best); }
    else if (bestScore >= RECONCILE.DRIFTED) {
      drifted.push({ entry: e, draft: best, score, differences: diffs }); seen.add(best);
    } else stale.push({ entry: e, nearest: best, score });
  }
  const unmatchedDraft = candidates.filter(c => !seen.has(c));
  return { matched, drifted, stale, unmatchedDraft, candidates: candidates.length };
}

/* ============================ 6b. quote verification ============================ */
// Deterministic, no model. Two independent implementations converge on the same rules and both
// report it as a solved problem: pagecite (PyPI) and citefact (PyPI) each compare a draft's
// quotations against the source text and classify verified / modified / not-found. Measured base
// rate from a production sample (wyper.io, n=513 readable pages): **6.43% of cited quotes were not
// on the page, upper 95% bound 8.56%** — one in fifteen, so this earns a check.
//
// Normalisation rules taken from pagecite, because each one is a real failure mode it names:
//   - ignore case, punctuation and spacing
//   - fold ligatures (ﬁ -> fi)
//   - rejoin words split across a line break ("con-\nstraint" -> "constraint")
//   - normalise thousands separators (3,200 = 3200)
//   - **keep decimal points**, so "4.2" can never match "42"  <- the one that matters most
//   - an ellipsis splits the quote into parts that must appear IN ORDER
//   - a quote under four words is too short to prove anything
// citefact's structural rule is adopted too: text inside code fences and tables is never scanned.

const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };

export function normaliseQuote(s) {
  return String(s || '')
    // Unicode first. A PDF or web page may encode "café" as NFD (e + combining accent) while a draft
    // contains NFC, and the two are different bytes for the same word. Measured: an NFD corpus made
    // a perfectly good quotation report "not found" — a false accusation against an innocent author,
    // which is the direction this tool must never fail in.
    .normalize('NFC')
    .replace(/[\uFB00-\uFB06]/g, c => LIGATURES[c] || c)
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')      // hyphenated line break
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')             // thousands separators
    .replace(/(\d)\.(?=\d)/g, '$1\u0001')               // protect decimal points
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u0001\u0002]+/gu, ' ')
    .replace(/\u0001/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sentence boundaries, as a token that survives normalisation. Stripping punctuation let a
// quotation that joins the end of one sentence to the start of the next match a source in which
// those words never appear together: "…report greater cohesion Adolescent anxiety…" came back
// VERIFIED. Dropping a full stop and joining two sentences is a misquotation, so it gets its own
// verdict rather than being called verified or accused of being absent.
const BOUNDARY = '\u0002';
const QUOTE_ABBREV = /^(?:dr|mr|mrs|ms|st|jr|sr|prof|rev|cf|vs|al|etc|no|vol|pp|p|fig|ch|sec|e|i)$/i;
const withBoundaries = s => normaliseQuote(String(s).replace(
  /(\p{L}+)([.!?])["\u201d\u2019)\]]?\s+(?=[A-Z0-9"\u201c])/gu,
  (m, word, dot) => (word.length === 1 || QUOTE_ABBREV.test(word)) ? m : `${word}${dot} ${BOUNDARY} `));

const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// Inline quotations, scanned a BLOCK at a time rather than a line at a time.
//
// Why blocks: markdown prose is hard-wrapped, so a quotation routinely breaks across a newline —
// 70 lines of the document this was built against do exactly that. A line-by-line scan returns
// NOTHING for a quote like
//     "the memorization of basic prayers offers an essential support to the life of prayer,
//      but it is important to help learners savor their meaning"
// which silently undercounts the document's quotations rather than mislabelling them. That is the
// same hard-wrap bug the draft auditor had, and it is worse here because a miss looks like absence.
//
// Blockquote markers ("&gt; ") are stripped, so a quotation inside a callout is checked; a callout
// with no quotation marks produces nothing, so ordinary callout prose adds no noise. Fenced code and
// table rows are still excluded.
export function extractQuotes(markdown = '') {
  const out = [];
  let block = [];
  let inFence = false;

  const sentenceAround = (text, idx) => {
    const start = Math.max(0, text.lastIndexOf('. ', idx) + 2);
    const endDot = text.indexOf('. ', idx);
    const end = endDot < 0 ? text.length : endDot + 1;
    return text.slice(start, end).trim() || text;
  };

  const flush = () => {
    if (!block.length) return;
    const text = block.join(' ').replace(/\s+/g, ' ').trim();
    block = [];
    if (text.length < 4) return;
    const re = /["\u201C]([^"\u201C\u201D]{4,400})["\u201D]/g;
    let m;
    while ((m = re.exec(text))) {
      const quote = m[1].trim();
      const words = wordCount(quote);
      // Context is the sentence carrying the quote, not the whole block: proximity to a citation is
      // what separates a quotation from a scare quote, and a paragraph-wide window would blur that.
      out.push({ quote, words, tooShort: words < 4, context: sentenceAround(text, m.index) });
    }
  };

  for (const raw of String(markdown).split('\n')) {
    if (/^```/.test(raw.trim())) { flush(); inFence = !inFence; continue; }
    if (inFence) continue;
    const line = raw.replace(/^\s*>\s?/, '');
    if (!line.trim() || line.trim().startsWith('|')) { flush(); continue; }
    block.push(line.trim());
  }
  flush();
  return out;
}

export function verifyQuote(quote, corpusText) {
  if (wordCount(quote) < 4) return { status: 'too-short', why: 'under four words proves nothing' };
  const parts = String(quote).split(/\u2026|\.\.\./).map(normaliseQuote).filter(p => p.length > 8);
  if (!parts.length) return { status: 'too-short', why: 'no usable fragment' };
  const hay = normaliseQuote(corpusText);
  const hayB = withBoundaries(corpusText);
  let pos = 0;
  let spliced = null;
  for (const p of parts) {
    const i = hay.indexOf(p, pos);
    if (i < 0) return { status: 'not-found', part: parts.length > 1 ? p.slice(0, 90) : undefined };
    // Present in the flattened text but absent once sentence boundaries are marked: the words exist,
    // but only by joining two sentences with the full stop removed.
    if (!spliced && !hayB.includes(p)) spliced = p.slice(0, 90);
    pos = i + p.length;
  }
  if (spliced) {
    return { status: 'spliced', part: spliced,
      why: 'matches only across a sentence boundary — the full stop is missing or an ellipsis is needed' };
  }
  return { status: 'verified', parts: parts.length };
}

// A citation marker near the quote. This is what separates a quotation from a scare quote, a
// rhetorical question in quotation marks, or the words of a prayer — none of which are claims about
// a source and none of which should be reported as unverified. Measured need: on a real draft, 69
// inline quotes yielded 34 "not found" of which most were the author's own emphasis.
const CITE_NEAR = new RegExp(String.raw`\b${NAME}\s*(?:et\s+al\.?,?\s*)?[,(]?\s*(?:19|20)\d{2}\b`
  + String.raw`|\((?:[^()]{0,90}?)(?:19|20)\d{2}[^()]{0,30}\)`
  + String.raw`|§+\s*\d`
  + String.raw`|\bCCC\s*\d`
  // A DOI or URL is an attribution too. Missing these made a DOI-cited quotation look
  // unattributed, which silently skipped the check rather than passing it.
  + String.raw`|10\.\d{4,9}\/[^\s)"'<>]+`
  + String.raw`|https?:\/\/`, 'i');

// Verify every inline quote in a draft against a corpus of plain-text sources.
export function quoteReport(markdown, corpusText) {
  const quotes = extractQuotes(markdown);
  const results = quotes.map(q => {
    if (q.tooShort) return { ...q, status: 'too-short', why: 'under four words proves nothing' };
    if (!CITE_NEAR.test(q.context || '')) {
      return { ...q, status: 'unattributed',
        why: 'no citation in the same sentence — the author\'s own words, a prayer text, or a scare quote' };
    }
    return { ...q, ...verifyQuote(q.quote, corpusText) };
  });
  return {
    total: results.length,
    verified: results.filter(r => r.status === 'verified').length,
    notFound: results.filter(r => r.status === 'not-found'),
    spliced: results.filter(r => r.status === 'spliced'),
    unattributed: results.filter(r => r.status === 'unattributed').length,
    tooShort: results.filter(r => r.status === 'too-short').length,
    results,
  };
}

/* ============================ 6c. citation / reference symmetry ============================ */
// citefact's two cheapest findings, both deterministic and both free:
//   orphan_citation   — an in-text citation with no bibliography entry (the fabricated-citation signal)
//   uncited_reference — a bibliography entry never cited in the text
// A quotation that is perfectly verbatim in the right source is still a defect if its bibliography
// entry does not exist, and this is the only check here that needs no source text at all.

function sourcesBlock(markdown) {
  const lines = String(markdown).split('\n');
  let i = lines.findIndex(l => /^#{1,6}\s+\**\s*sources\b/i.test(l.trim()) || /^\**sources:?\**$/i.test(l.trim()));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (/^#{1,6}\s/.test(l.trim())) break;
    const m = /^\s*[-*]\s+(.*)$/.exec(l);
    if (m) out.push(m[1]);
    else if (out.length && /^\s{2,}\S/.test(l)) out[out.length - 1] += ' ' + l.trim();  // wrapped entry
  }
  return out;
}

// An entry can legitimately cover several years — "Pew Research Center (2009) … and (2016)" is one
// source cited twice — so return every year it names rather than only the first. Returning one
// made "Pew 2016" look like an orphan citation when its reference entry existed.
function surnameYearsFromEntry(entry) {
  // An entry may be a semicolon-separated list — "- Calvert & Tart (1993); Rainey & Larsen (2002);
  // Kilgour et al. (2000); …" is one bullet carrying four citations. Splitting first is essential:
  // truncating at the first year made every citation after the first look like an orphan.
  const parts = String(entry).split(/;\s*/).filter(p => /\b(?:19|20)\d{2}\b/.test(p));
  const out = [];
  for (const part of parts) {
    const stop = part.search(/\((?:19|20)\d{2}|(?:19|20)\d{2}/);
    const phrase = (stop > 0 ? part.slice(0, stop) : part).replace(/^[-–—*\s]+/, '').replace(/[*_`]/g, ' ').trim();
    if (!phrase) continue;
    const words = nameWords(phrase);
    if (!words.size) continue;
    const years = [...new Set([...part.matchAll(/\(((?:19|20)\d{2})[a-z]?\)/g)].map(m => m[1]))];
    if (!years.length) continue;
    // Author-like, so that a title-only entry is not reported as an uncited reference under a
    // meaningless label like "initiating 2020". A real author/institution prefix has a comma, an
    // ampersand, "et al", an institution noun, or capitalises nearly all of its content words;
    // a title set in italics or quotes does not.
    const contentWords = [...phrase.matchAll(/\p{L}[\p{L}'\u2019-]*/gu)].length;
    const capWords = [...phrase.matchAll(/\p{Lu}[\p{L}'\u2019-]*/gu)].length;
    const authorLike = !/^[*"\u201C']/.test(part.trim())
      && (/[,&]/.test(phrase) || /\bet al\b/.test(phrase)
        || [...INST_WORD].some(w => phrase.includes(w))
        || capWords >= Math.max(1, contentWords * 0.6));
    const label = (/[A-Z][A-Za-z'\u2019-]{2,}/.exec(phrase) || [])[0]
      || [...words].slice(0, authorLike ? 1 : 3).join(' ');
    for (const y of years) out.push({ name: label, year: y, label: `${label} ${y}`, words, authorLike });
  }
  return out;
}

// Containment, either direction: "Pew" ⊂ "Pew Research Center", and "rainey" ⊂ "Rainey, D. W.,
// & Larsen, J. D.". Exact string equality was the bug — it made every institution and every
// multi-author entry an orphan.
function nameMatches(a, b) {
  if (!a.size || !b.size) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

export function citationSymmetry(markdown) {
  const entries = sourcesBlock(markdown);
  const listed = entries.flatMap(surnameYearsFromEntry);
  const cited = citedAuthorYears(markdown);

  const orphans = cited.filter(c => !listed.some(l => l.year === c.year && nameMatches(c.words || new Set([c.name.toLowerCase()]), l.words)));
  // Only author-like entries: a title-only reference appearing as "uncited" is usually a document
  // the author cited by title rather than by name, and reporting it under a three-word title label
  // adds noise without adding a defect.
  const uncited = listed.filter(l => l.authorLike
    && !cited.some(c => c.year === l.year && nameMatches(c.words || new Set([c.name.toLowerCase()]), l.words)));

  return { entries: entries.length, listed: listed.length, cited: cited.length, orphans, uncited };
}

/* ============================ 6d. online quote checking ============================ */
// Probed 2026-10-29 with a plain curl and a browser User-Agent, against the kinds of source this
// project actually cites:
//   arXiv PDF   200 (application/pdf)      PMC OA article   200        vatican.va   200
//   pewresearch.org  200                   scborromeo.org   200        MDPI PDF     403 Access Denied
// So most sources CAN be checked online — preprints, PMC, and institutional web pages — while some
// publishers block automated fetches and closed-access work is unavailable by definition. The
// failure mode to avoid is treating "could not fetch" as "quote is wrong". Those are different
// outcomes and the report keeps them different.

const pdfCacheDir = () => `${process.env.HOME || '.'}/.cache/citekit/src`;

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Fetch one URL and return plain text, caching by URL so a second run costs nothing. A PDF is
// converted with pdftotext (poppler) rather than a JS parser: it is present on this machine, it
// handles real publisher PDFs, and it keeps the dependency out of node_modules.
export async function fetchSourceText(url, { timeoutMs = 25000, cacheDir = pdfCacheDir(), fetchImpl = fetch } = {}) {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const key = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const txtPath = `${cacheDir}/${key}.txt`;
  try {
    if (fs.existsSync(txtPath)) {
      const cached = fs.readFileSync(txtPath, 'utf8');
      if (cached.length > 200) {
        // Index on the cache-hit path too, or a source fetched before the index existed stays
        // unaddressable forever and the whole point of the cache is lost.
        try {
          const indexPath = `${cacheDir}/index.json`;
          let idx = {};
          try { idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { idx = {}; }
          if (!idx[url]) {
            idx[url] = { file: `${key}.txt`, chars: cached.length, via: 'cache', at: new Date().toISOString() };
            fs.writeFileSync(indexPath, JSON.stringify(idx, null, 1));
          }
        } catch { /* best-effort */ }
        return { ok: true, text: cached, via: 'cache', chars: cached.length };
      }
    }
  } catch { /* cache miss is not an error */ }

  let body, ctype;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetchImpl(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
          + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, blocked: res.status === 403 || res.status === 429 };
    ctype = res.headers.get('content-type') || '';
    body = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 80) };
  }

  const isPdf = /pdf/i.test(ctype) || body.slice(0, 5).toString('latin1') === '%PDF-';
  let text;
  if (isPdf) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const pdfPath = `${cacheDir}/${key}.pdf`;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(pdfPath, body);
      const { stdout } = await run('pdftotext', ['-layout', pdfPath, '-'], { maxBuffer: 64 * 1024 * 1024 });
      text = stdout;
    } catch (e) {
      return { ok: false, reason: `pdf extract failed: ${String(e.message).slice(0, 60)}` };
    }
  } else {
    text = stripHtml(body.toString('utf8'));
  }

  if (!text || text.length < 200) return { ok: false, reason: `only ${text ? text.length : 0} chars extracted` };
  try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(txtPath, text); } catch { /* cache write is best-effort */ }
  // Record URL -> file, so the cache is addressable later. Without this the cache is a pile of
  // sha1 filenames, and "read only the passage you need" degrades to "cat the whole paper".
  try {
    const indexPath = `${cacheDir}/index.json`;
    let idx = {};
    try { idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { idx = {}; }
    idx[url] = { file: `${key}.txt`, chars: text.length, via: isPdf ? 'pdf' : 'html', at: new Date().toISOString() };
    fs.writeFileSync(indexPath, JSON.stringify(idx, null, 1));
  } catch { /* index is best-effort */ }
  return { ok: true, text, via: isPdf ? 'pdf' : 'html', chars: text.length };
}

// The cached sources, biggest first — the reading list an agent can query instead of reloading.
export async function readSourceIndex(cacheDir = pdfCacheDir()) {
  const fs = await import('node:fs');
  try { return JSON.parse(fs.readFileSync(`${cacheDir}/index.json`, 'utf8')); }
  catch { return {}; }
}

// Return only the lines that match, plus a little context. This is the token-cheap alternative to
// putting a whole source in front of a model: the passage that settles the question, not the paper.
export async function findPassages(cacheDir, query, pattern, { context = 2, max = 20 } = {}) {
  const fs = await import('node:fs');
  const idx = await readSourceIndex(cacheDir);
  const re = new RegExp(pattern, 'i');
  const out = [];
  for (const [url, meta] of Object.entries(idx)) {
    if (query && !url.toLowerCase().includes(String(query).toLowerCase())
      && !String(meta.file).toLowerCase().includes(String(query).toLowerCase())) continue;
    const p = `${cacheDir}/${meta.file}`;
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      const text = lines.slice(Math.max(0, i - context), Math.min(lines.length, i + context + 1))
        .join('\n').replace(/[ \t]+/g, ' ').trim();
      if (text) out.push({ url, line: i + 1, text });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// The citation nearest a quote, most specific first. A DOI beats a URL beats a label, because each
// step down that list is a step away from something that can be resolved unambiguously.
export function citationLabelIn(context) {
  const c = String(context || '');
  const doi = /(10\.\d{4,9}\/[^\s)"'<>\]]+)/.exec(c);
  if (doi) return { kind: 'doi', value: doi[1].replace(/[.,;]$/, '') };
  const url = /(https?:\/\/[^\s)"'<>\]]+)/.exec(c);
  if (url) return { kind: 'url', value: url[1] };
  // "§" is not automatically the Catechism: the same documents write "DGC §154", "DC §201" and
  // their own internal cross-references as "§3.2". Assuming CCC mapped an internal cross-reference
  // to "CCC 3" and then checked a prayer quote against a catechism page.
  const sect = /§+\s*(\d+)/.exec(c);
  if (sect) {
    const n = sect[1];
    // Nearest source word BEFORE the section mark wins, because a line can mention both
    // ("DGC §154 … and the CCC agrees"). Scanning the whole line picked CCC for a DGC citation.
    const before = c.slice(Math.max(0, sect.index - 60), sect.index);
    if (/\b(?:CCC|Catechism)\b/i.test(before)) return { kind: 'label', value: `CCC ${n}` };
    const d = /\b(DGC|GDC|DC|Directory)\b/i.exec(before);
    if (d) return { kind: 'label', value: `${d[1].toUpperCase()} §${n}` };
    if (/\b(?:CCC|Catechism)\b/i.test(c)) return { kind: 'label', value: `CCC ${n}` };
    return { kind: 'label', value: `§${n}` };
  }
  const ccc = /\bCCC\s*(\d+)/.exec(c);
  if (ccc) return { kind: 'label', value: `CCC ${ccc[1]}` };
  const ay = /\b([A-Z][A-Za-z'\u2019-]{2,})\s*(?:et\s+al\.?)?,?\s*((?:19|20)\d{2})\b/.exec(c);
  if (ay) return { kind: 'label', value: `${ay[1]} ${ay[2]}` };
  return null;
}

// Every citation in a sentence, deduped, most specific kind first. Multi-source sentences are
// normal ("…the book reports that “…” (Pew 2009; Bengtson 2013)"), and taking only the first label
// checked a quotation against the source that happened to be mentioned first.
export function citationLabelsIn(context) {
  const c = String(context || '');
  const out = [];
  const push = l => { if (l && !out.some(x => x.value === l.value)) out.push(l); };
  for (const m of c.matchAll(/(10\.\d{4,9}\/[^\s)"'<>\]]+)/g)) push({ kind: 'doi', value: m[1].replace(/[.,;]$/, '') });
  for (const m of c.matchAll(/(https?:\/\/[^\s)"'<>\]]+)/g)) push({ kind: 'url', value: m[1] });
  push(citationLabelIn(c));
  for (const m of c.matchAll(/\b([A-Z][A-Za-z'\u2019-]{2,})\s*(?:et\s+al\.?)?,?\s*((?:19|20)\d{2})\b/g)) {
    const first = m[1];
    if (NOT_A_NAME.has(first) || CLASS_LABEL.has(first) || INST_WORD.has(first)) continue;
    push({ kind: 'label', value: `${first} ${m[2]}` });
  }
  return out.slice(0, 4);            // bounded: each label can cost a network round trip
}

// A user-supplied label -> URL map. Explicit because it is the only reliable way to point at a book,
// a catechism paragraph, or a report: guessing a publisher URL from "Pew 2016" would sometimes
// resolve to the wrong document, and a wrong document produces a confident false verdict.
export function mapLookup(map, label) {
  if (!map || !label) return null;
  const want = label.toLowerCase().trim();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase().trim() === want) return typeof v === 'string' ? { url: v } : v;
  }
  // "CCC 2688" -> a map key of "CCC" covers every paragraph the same document contains
  const base = want.split(/\s+/)[0];
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase().trim() === base) return typeof v === 'string' ? { url: v } : v;
  }
  // A bare "§N" has no source word in it, so a document that files its paragraphs as "CCC 2727"
  // should still resolve "§2727". Try the specific and the generic spellings before giving up.
  if (want.startsWith('§')) {
    const n = want.replace(/^§\s*/, '');
    for (const alt of [`ccc ${n}`, `dgc §${n}`, `dgc ${n}`]) {
      const v = map[alt] ?? map[alt.toUpperCase()] ?? map[Object.keys(map).find(k => k.toLowerCase().trim() === alt)];
      if (v) return typeof v === 'string' ? { url: v } : v;
    }
    if (map['§']) return typeof map['§'] === 'string' ? { url: map['§'] } : map['§'];
  }
  return null;
}

async function openAlexOaUrls(doi, fetchImpl = fetch, cacheRoot = pdfCacheDir()) {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const cacheDir = `${cacheRoot}/oa`;
  const cacheFile = `${cacheDir}/${crypto.createHash('sha1').update(String(doi)).digest('hex').slice(0, 16)}.json`;
  const TTL_MS = 7 * 24 * 3600 * 1000;
  // A work's OA locations rarely change, and this lookup sits behind every DOI-cited quotation.
  // Caching it removes a round trip per quote on repeat runs — the call is free either way, but
  // free is not the same as instant.
  try {
    const hit = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (hit && Date.now() - hit.at < TTL_MS && Array.isArray(hit.urls)) {
      return { urls: hit.urls, title: hit.title || '', status: hit.status, cached: true };
    }
  } catch { /* cache miss */ }

  const url = oaWorkUrl(doi, 'select=doi,title,open_access,best_oa_location,locations');
  let out;
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { urls: [], reason: openAlexError(res.status, url).message };
    const d = await res.json();
    const urls = [];
    const push = u => { if (u && !urls.includes(u)) urls.push(u); };
    // best_oa_location is NOT authoritative. Probed: for 10.48550/arXiv.1706.03762 OpenAlex returns
    // the right title but a best_oa_location on an unrelated preprint host, so trusting it alone
    // fetches the wrong paper and turns into a false accusation. Collect every OA location and try
    // them in order, publisher copy first, then repositories (which are often NOT bot-blocked when
    // the publisher is: MDPI 403s, but the Texas Tech mirror of the same paper does not).
    const best = d?.best_oa_location;
    if (best?.is_oa) push(best.pdf_url), push(best.landing_page_url);
    for (const l of d?.locations || []) if (l?.is_oa) { push(l.pdf_url); push(l.landing_page_url); }
    out = { urls, title: d?.title || '', status: d?.open_access?.oa_status };
  } catch (e) { return { urls: [], reason: e.message.slice(0, 90) }; }

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ ...out, at: Date.now() }));
  } catch { /* best-effort */ }
  return out;
}

// Does this fetched text actually belong to the cited work? Without this check a wrong-but-fetchable
// URL produces a confident "quote not found" against an innocent author. Half of a title's longer
// words appearing is enough to accept, and failing to find the title rejects the candidate rather
// than the quote.
export function titleMatches(title, text) {
  const words = [...new Set(normaliseQuote(title).split(' ')
    .filter(w => w.length >= 4 && !STOPWORDS.has(w)))];
  if (!words.length) return true;
  const hay = normaliseQuote(text);
  return words.filter(w => hay.includes(w)).length / words.length >= 0.6;
}

// Verify quotes against online sources, falling back to a local corpus. Every quote lands in
// exactly one bucket, and `unverifiable` is never reported as a failure.
export async function quotesOnline(markdown, {
  map = null, corpusText = '', cacheDir = pdfCacheDir(), fetchImpl = fetch, online = true,
} = {}) {
  const quotes = extractQuotes(markdown);
  const results = [];
  for (const q of quotes) {
    if (q.tooShort) { results.push({ ...q, status: 'too-short' }); continue; }
    // A sentence can cite several works: "…the book reports that “…” (Pew 2009; Bengtson 2013)".
    // Taking only the first label checked a Bengtson quotation against Pew 2009 and reported a
    // false "not found". Every label in the sentence is now a candidate source.
    const labels = CITE_NEAR.test(q.context || '') ? citationLabelsIn(q.context) : [];
    if (!labels.length) { results.push({ ...q, status: 'unattributed' }); continue; }

    // local corpus first: free, offline, and typically the text has already been curated
    if (corpusText) {
      const local = verifyQuote(q.quote, corpusText);
      if (local.status === 'verified') { results.push({ ...q, ...local, via: 'corpus' }); continue; }
    }

    const notes = [];        // why a label could not be used
    const readable = [];     // labels we actually managed to read
    let hit = null;

    for (const near of labels) {
      const candidates = [];
      const mapped = mapLookup(map, near.value);
      if (mapped?.url) {
        for (const u of (Array.isArray(mapped.url) ? mapped.url : [mapped.url])) {
          candidates.push({ url: u, how: 'map', title: mapped.title || '' });
        }
      } else if (near.kind === 'url') {
        candidates.push({ url: near.value, how: 'url' });
      } else if (near.kind === 'doi' && online) {
        const oa = await openAlexOaUrls(near.value, fetchImpl, cacheDir);
        if (oa.urls.length) {
          for (const u of oa.urls) candidates.push({ url: u, how: 'openaccess', title: oa.title });
        } else {
          // OpenAlex has no copy. Unpaywall is the specialist at this question, and it also reports
          // which VERSION each copy is: quoting a submitted manuscript as though it were the
          // published paper is a fidelity error in its own right. Only consulted when configured,
          // so an unconfigured backup never masks the source's own explanation.
          const up = unpaywallEmail()
            ? await unpaywallDoi(near.value, { fetchImpl, cacheRoot: cacheDir }).catch(() => null)
            : null;
          if (up?.urls?.length) {
            for (const loc of up.locations) {
              candidates.push({ url: loc.url, how: 'unpaywall', title: oa.title, version: loc.version });
            }
          } else {
            notes.push(`${near.value}: ${up?.reason || oa.reason
              || (oa.status === 'closed' ? 'closed access' : 'no open-access copy')}`);
            continue;
          }
        }
      }
      if (!candidates.length) { notes.push(`${near.value}: no URL — add it to --map`); continue; }

      // Try candidates until one both fetches AND can be shown to be the cited work.
      const num = /^(?:CCC|DGC|GDC|DC|§)\s*§?\s*(\d{2,4})$/.exec(near.value);
      let usable = null, why = null;
      for (const c of candidates) {
        const src = await fetchSourceText(c.url, { cacheDir, fetchImpl });
        if (!src.ok) {
          why = src.blocked ? `${src.reason} — publisher blocks automated fetch` : src.reason;
          continue;
        }
        if (c.title && !titleMatches(c.title, src.text)) { why = 'document does not match the cited title'; continue; }
        if (num && !new RegExp(`\\b${num[1]}\\b`).test(src.text)) { why = `page does not contain \u00a7${num[1]}`; continue; }
        usable = { c, src };
        break;
      }
      if (!usable) { notes.push(`${near.value}: ${why || 'no usable copy'}`); continue; }
      const v = verifyQuote(q.quote, usable.src.text);
      readable.push({ near, usable, v });
      if (v.status === 'verified') { hit = { near, usable, v }; break; }
    }

    if (hit) {
      results.push({ ...q, ...hit.v, cite: hit.near.value, via: hit.usable.c.how,
        url: hit.usable.c.url, sourceChars: hit.usable.src.chars,
        version: hit.usable.c.version || undefined });
      continue;
    }
    // Accuse the quote only when EVERY source cited beside it was actually read. If any one was
    // blocked, closed, or the wrong page, the quotation may belong to that source, so the honest
    // answer is "could not check". A source we failed to read must never become a verdict.
    if (readable.length && !notes.length) {
      results.push({ ...q, status: 'not-found',
        cite: readable.map(c => c.near.value).join('; '), url: readable[0].usable.c.url });
    } else {
      results.push({ ...q, status: 'unverifiable',
        cite: labels.map(l => l.value).join('; '), why: notes.join(' | ') || 'no usable copy' });
    }
  }

  const by = s => results.filter(r => r.status === s);
  return {
    total: results.length,
    verified: by('verified').length,
    notFound: by('not-found'),
    unverifiable: by('unverifiable'),
    unattributed: by('unattributed').length,
    tooShort: by('too-short').length,
    results,
  };
}

/* ============================ 7. how a paper is actually cited ============================ */
// Semantic Scholar returns `contexts` — the verbatim sentences in which a citing paper refers to
// this one — plus `intents`. Probed keyless on 2026-10-29: no key or proxy needed for this
// endpoint. Useful for asking "is this paper commonly misquoted?" before relying on it; it is a
// research aid, not a gate, because a wrong citation elsewhere says nothing about your own.
export async function citationContexts(doi, { limit = 8, s2Key = process.env.CITEKIT_S2_KEY || '' } = {}) {
  const d = strip(doi);
  if (!d) return [];
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(d)}`
    + `/citations?fields=contexts,intents,isInfluential,title,year&limit=${limit}`;
  let json;
  try {
    json = await getJSON(url, 20000, s2Key ? { 'x-api-key': s2Key } : {});
  } catch (e) {
    // Probed 2026-10-29: this endpoint answers keyless, but the anonymous pool rate-limits to 429
    // within a few calls — the same shared-pool limit already documented for the app's S2 adapter.
    // Say so, rather than surfacing a bare HTTP 429.
    if (/429/.test(e.message)) {
      throw new Error('Semantic Scholar rate-limited (HTTP 429, anonymous pool). '
        + 'Set CITEKIT_S2_KEY for a dedicated 1 rps quota, or retry later.');
    }
    throw e;
  }
  return (json?.data || []).map(c => ({
    citingTitle: c.citingPaper?.title || null,
    year: c.citingPaper?.year || null,
    intents: c.intents || [],
    influential: !!c.isInfluential,
    contexts: c.contexts || [],
  }));
}

/* ============================ network layer ============================ */

const strip = d => String(d || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();

async function getJSON(url, timeoutMs = 20000, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', ...headers } });
    // OpenAlex reports remaining budget on EVERY response. Reading it turns "worked, then suddenly
    // 429" into a visible number, which is the only way to catch exhaustion before it happens.
    if (/api\.openalex\.org/.test(url)) {
      const rem = res.headers.get('x-ratelimit-remaining-usd');
      const lim = res.headers.get('x-ratelimit-limit-usd');
      if (rem != null) _budget = { remainingUsd: Number(rem), limitUsd: lim != null ? Number(lim) : null };
    }
    if (res.status === 404) return null;
    if (!res.ok) throw (/api\.openalex\.org/.test(url) ? openAlexError(res.status, url) : new Error(`HTTP ${res.status} for ${url}`));
    return await res.json();
  } finally { clearTimeout(timer); }
}

// The most recent OpenAlex budget reading, for callers that want to warn before it runs out.
let _budget = null;
export function openAlexBudget() { return _budget; }

export function openAlexBudgetWarning() {
  const b = _budget;
  if (!b || b.limitUsd == null || !b.limitUsd) return null;
  const pct = b.remainingUsd / b.limitUsd;
  if (pct > 0.2) return null;
  return `OpenAlex budget low: $${b.remainingUsd.toFixed(4)} of $${b.limitUsd.toFixed(2)} left `
    + `(${Math.round(pct * 100)}%). Set CITEKIT_OPENALEX_KEY for $1/day instead of the shared $0.10.`;
}

export async function fetchCrossref(doi) {
  const d = strip(doi);
  if (!d) return null;
  return getJSON(`https://api.crossref.org/works/${encodeURIComponent(d)}`);
}

export async function fetchOpenAlex(doi) {
  const d = strip(doi);
  if (!d) return null;
  return getJSON(oaWorkUrl(d));
}

/* ============================ 6e. critique, datasets, and the open-access backup ============================ */

// A small on-disk cache for lookups whose answers barely change (OA locations, dataset metadata).
// Deliberately NOT used for anything that can change while its identifiers stay fixed — retraction
// status and comment counts both fall in that category and are always fetched fresh.
async function cachedJson(cacheRoot, ns, key, ttlMs, produce) {
  const fs = requireSync('node:fs');
  const crypto = requireSync('node:crypto');
  const dir = `${cacheRoot}/${ns}`;
  const file = `${dir}/${crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16)}.json`;
  try {
    const hit = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A null value is not a cached answer, and a timestamp in the future would pin an entry for ever
    // — a corrupted or hostile cache file could otherwise outlive every TTL.
    if (hit && hit.value && Number.isFinite(hit.at)
      && hit.at <= Date.now() + 60e3 && Date.now() - hit.at < ttlMs) {
      return { ...hit.value, cached: true };
    }
  } catch { /* miss */ }
  const value = await produce();
  if (value && !value.reason) {
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: Date.now(), value })); } catch { /* best effort */ }
  }
  return value;
}

// --- PubPeer: post-publication critique, which is neither a citation nor a retraction ------------
// Probed: POST with 60 DOIs answers 200, rate limit is 20 requests, response carries
// {feedbacks:[{id (=DOI), total_comments, total_peeriodical_comments, users, url, last_commented_at}]}.
// The devkey is the one Zotero and metacheck use; PubPeer has no public API yet, so this is
// best-effort and must never be presented as exhaustive.
export const PUBPEER_DEVKEY = 'PubPeerZotero';
export const PUBPEER_CHUNK = 50;

export function mapCritiqueResponse(json = {}) {
  const out = new Map();
  for (const f of json.feedbacks || []) {
    const doi = strip(f.id).toLowerCase();
    if (!doi) continue;
    const comments = Number(f.total_comments || 0) + Number(f.total_peeriodical_comments || 0);
    out.set(doi, {
      comments,
      url: f.url || null,
      users: String(f.users || '').slice(0, 200) || null,
      lastCommentedAt: f.last_commented_at || null,
    });
  }
  return out;
}

export async function critiqueDois(dois, { fetchImpl = fetch } = {}) {
  const list = [...new Set((Array.isArray(dois) ? dois : [dois]).map(strip).filter(Boolean))];
  const hits = new Map();
  const errors = [];
  if (!list.length) return { hits, errors, requested: 0, checked: 0 };
  let checked = 0;
  for (let i = 0; i < list.length; i += PUBPEER_CHUNK) {
    const chunk = list.slice(i, i + PUBPEER_CHUNK);
    try {
      const res = await fetchImpl(`https://pubpeer.com/v3/publications?devkey=${PUBPEER_DEVKEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dois: chunk }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const [k, v] of mapCritiqueResponse(await res.json())) hits.set(k, v);
      // Only a chunk that actually answered counts as checked. Returning list.length here made a
      // failed batch invisible: every DOI was reported covered while one quarter of them were never
      // looked at. Same defect as a truncated page of results, and the same fix — count what answered.
      checked += chunk.length;
    } catch (e) { errors.push(`PubPeer: ${e.message.slice(0, 70)}`); }
  }
  return { hits, errors, requested: list.length, checked };
}

// --- Unpaywall: the open-access location backup, and version provenance -------------------------
// Requires an email (Unpaywall's rule, not a paid key). Probed: CORS `*`, no advertised rate limit,
// 12/12 on a burst, and a 404 returns HTML rather than JSON — so the status is checked first.
// Value over OpenAlex is not more locations but `version`: quoting a submittedVersion as if it were
// the publishedVersion is exactly the class of error this tool exists to catch.
export function unpaywallEmail() {
  return process.env.CITEKIT_UNPAYWALL_EMAIL || '';
}

export async function unpaywallDoi(doi, { fetchImpl = fetch, cacheRoot = pdfCacheDir() } = {}) {
  const email = unpaywallEmail();
  if (!email) return { reason: 'no email set — export CITEKIT_UNPAYWALL_EMAIL to enable Unpaywall' };
  const d = strip(doi);
  return cachedJson(cacheRoot, 'unpaywall', d, 7 * 864e5, async () => {
    try {
      const res = await fetchImpl(`https://api.unpaywall.org/v2/${encodeURIComponent(d)}?email=${encodeURIComponent(email)}`);
      if (res.status === 404) return { reason: 'not in Unpaywall' };
      if (!res.ok) return { reason: `Unpaywall HTTP ${res.status}` };
      const j = await res.json();
      const locations = (j.oa_locations || []).map(l => ({
        url: l.url_for_pdf || l.url_for_landing_page || null,
        hostType: l.host_type || null,
        version: l.version || null,
      })).filter(l => l.url);
      return { urls: locations.map(l => l.url), locations, isOa: !!j.is_oa, oaStatus: j.oa_status || null };
    } catch (e) { return { reason: e.message.slice(0, 80) }; }
  });
}

// --- DataCite: the "cited object is a dataset, not a paper" case ---------------------------------
// Probed: single-DOI lookup answers 200 with CORS `*`. OpenAlex indexes many datasets but not all,
// so a DOI that OpenAlex 404s may still be a real, citable object.
export async function dataciteDoi(doi, { fetchImpl = fetch, cacheRoot = pdfCacheDir() } = {}) {
  const d = strip(doi);
  return cachedJson(cacheRoot, 'datacite', d, 7 * 864e5, async () => {
    try {
      const res = await fetchImpl(`https://api.datacite.org/dois/${encodeURIComponent(d)}`);
      if (res.status === 404) return { reason: 'not in DataCite' };
      if (!res.ok) return { reason: `DataCite HTTP ${res.status}` };
      const j = await res.json();
      const a = j?.data?.attributes || {};
      return {
        found: true,
        kind: a?.types?.resourceTypeGeneral || null,
        title: (a?.titles || [{}])[0]?.title || null,
        year: a?.publicationYear || null,
        publisher: a?.publisher || null,
      };
    } catch (e) { return { reason: e.message.slice(0, 80) }; }
  });
}

// --- Crossref as a DEGRADED retraction backup ---------------------------------------------------
// Measured: Crossref allows 3 requests per second (`x-rate-limit-limit: 3`), so this paces itself and
// caps how many DOIs it will attempt rather than hammering. It is incomplete by construction —
// `filter=updates:` returns 0 for 10.1378/chest.128.6.3817, a retraction that OpenAlex knows about —
// so a result from here must be labelled degraded wherever it is shown.
export const CROSSREF_MIN_INTERVAL_MS = 350;

export async function crossrefRetractionFallback(dois, {
  fetchImpl = fetch, max = 25, intervalMs = CROSSREF_MIN_INTERVAL_MS,
} = {}) {
  const list = [...new Set((Array.isArray(dois) ? dois : [dois]).map(strip).filter(Boolean))];
  const capped = list.slice(0, max);
  const hits = new Map();
  const errors = [];
  let last = 0;
  let checked = 0;
  for (const doi of capped) {
    const wait = intervalMs - (Date.now() - last);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetchImpl('https://api.crossref.org/works?filter=updates:'
        + encodeURIComponent(doi) + '&rows=5&select=DOI,type,update-to');
      if (!res.ok) { errors.push(`${doi}: HTTP ${res.status}`); continue; }
      const j = await res.json();
      const items = j?.message?.items || [];
      const notice = items.find(i => (i['update-to'] || []).some(u => String(u.type || '').includes('retraction')))
        || items.find(i => String(i.type || '').includes('retraction'));
      if (notice) hits.set(doi.toLowerCase(), { retracted: true, notice: notice.DOI || null });
      // A request that failed taught us nothing, so it is not "checked". Reporting capped.length
      // here meant a run where every call 500'd still claimed full coverage of a weaker check.
      checked++;
    } catch (e) { errors.push(`${doi}: ${e.message.slice(0, 60)}`); }
  }
  return { hits, errors, requested: list.length, checked };
}

// One DOI, both registries, one verdict. OpenAlex supplies the type and the is_retracted flag;
// Crossref supplies the relation and the notice metadata that OpenAlex lacks.
export async function checkDoi(doi) {
  const [cr, oa] = await Promise.all([
    fetchCrossref(doi).catch(() => null),
    fetchOpenAlex(doi).catch(() => null),
  ]);
  const verdict = classifyRetraction({ crossref: cr, openalex: oa });
  const rec = oa ? oaToRecord(oa) : null;
  // OpenAlex does not index every dataset or software record. A DOI it 404s may still be a real,
  // citable object, and answering "unknown" for a live dataset is the same class of error as
  // accusing a good paper — so DataCite gets the final word before the tool says "not found".
  const dataset = !oa ? await dataciteDoi(doi).catch(() => null) : null;
  return {
    doi: strip(doi),
    title: rec?.title || (cr?.message?.title || [])[0] || dataset?.title || null,
    retraction: verdict,
    scope: rec ? claimScope({ ...rec, type: oa.type }) : null,
    dataset: dataset?.found
      ? { kind: dataset.kind, year: dataset.year, publisher: dataset.publisher }
      : null,
  };
}

/* --- batched screening ---------------------------------------------------------------
   Probed 2026-10-29: OpenAlex accepts a pipe-separated doi filter with select, so 3 DOIs came
   back in ONE call at cost_usd 0.0001. Screening a 20-result search therefore costs one metered
   call, not twenty. Screen cheap, then fetch Crossref detail only for the flagged ones.
   URL builder and response mapper are split out as pure functions so they test without network. */
export function screenUrl(dois, perPage = 100) {
  const list = (Array.isArray(dois) ? dois : [dois]).map(strip).filter(Boolean);
  if (!list.length) return null;
  return 'https://api.openalex.org/works?filter=doi:' + list.map(encodeURIComponent).join('|')
    + '&select=doi,type,is_retracted&per-page=' + perPage + openAlexKeyParam();
}

// OpenAlex caps OR at 100 values per filter and per_page at 100. Both limits were being violated:
// more than 100 DOIs made the whole request fail, and per-page=50 silently truncated the response,
// so DOIs beyond the fiftieth came back with no retraction flag and looked clean. A screen that
// quietly covers half its input is worse than no screen. Chunk at the OR limit and page at the
// same size, so every DOI in a chunk is guaranteed to be returned.
export const OPENALEX_OR_MAX = 100;

export function screenUrls(dois) {
  const list = (Array.isArray(dois) ? dois : [dois]).map(strip).filter(Boolean);
  if (!list.length) return [];
  const uniq = [...new Set(list)];
  const urls = [];
  for (let i = 0; i < uniq.length; i += OPENALEX_OR_MAX) {
    urls.push(screenUrl(uniq.slice(i, i + OPENALEX_OR_MAX), OPENALEX_OR_MAX));
  }
  return urls;
}

export function mapScreenResponse(json = {}) {
  const out = new Map();
  for (const w of json.results || []) {
    const doi = strip(w.doi).toLowerCase();
    if (!doi) continue;
    out.set(doi, classifyRetraction({ openalex: { type: w.type, is_retracted: w.is_retracted } }));
  }
  return out;
}

export async function screenDois(dois) {
  const urls = screenUrls(dois);
  if (!urls.length) return new Map();
  const merged = new Map();
  for (const u of urls) {
    const json = await getJSON(u);
    if (json) for (const [k, v] of mapScreenResponse(json)) merged.set(k, v);
  }
  return merged;
}

// An optional OpenAlex key, reusing the name the app already uses for the same setting.
// Keyless is a $0.10/day budget SHARED across everything on the network's IP (the mailto parameter
// does not raise it — OpenAlex says so in its own 200 notice); a free key is $1/day per account and
// raises the per-second limit from 10 to 30. Measured cost per call: single entity by DOI is FREE,
// list+filter is $0.0001, full-text search is $0.001 — so caching and doing fewer searches matter
// far more than batching lookups, which are already free.
export function openAlexKey() {
  const fromEnv = process.env.CITEKIT_OPENALEX_KEY || process.env.OPENALEX_API_KEY || '';
  if (fromEnv) return fromEnv.trim();
  // Same convention as ~/.config/citekit/tavily.key, so a key can live in a file with 600 perms
  // instead of in shell history or a chat message.
  try {
    const fs = requireSync('node:fs');
    const p = `${process.env.HOME || ''}/.config/citekit/openalex.key`;
    return fs.readFileSync(p, 'utf8').trim();
  } catch { return ''; }
}

export function openAlexKeyParam() {
  const k = openAlexKey();
  return k ? '&api_key=' + encodeURIComponent(k) : '';
}

// One builder for the single-entity URL, so no call site can forget the key. checkDoi used to
// build its own URL and silently stayed keyless even when a key was configured.
export function oaWorkUrl(doi, extraQuery = '') {
  const base = `https://api.openalex.org/works/doi:${encodeURIComponent(strip(doi))}`;
  const q = [extraQuery, openAlexKeyParam().replace(/^&/, '')].filter(Boolean).join('&');
  return q ? `${base}?${q}` : base;
}

// Every "budget exhausted" looks identical to "nothing found" from the caller's side, so name the
// actual cause and the actual fix.
// Credentials must never reach a log, a markdown file or an agent's context. Error messages quote the
// request URL, and the request URL carries the key — found by forcing a 401 and watching the banner
// print `api_key=...` verbatim. Redact before quoting.
export function redactUrl(u) {
  return String(u)
    .replace(/([?&]api_key=)[^&]*/gi, '$1REDACTED')
    .replace(/([?&]apiKey=)[^&]*/gi, '$1REDACTED')
    .replace(/([?&]email=)[^&]*/gi, '$1REDACTED')
    // Basic-auth credentials live in the authority, not the query: https://user:pass@host/…
    .replace(/(\/\/)[^/@\s]+@/g, '$1REDACTED@');
}

export function openAlexError(status, url) {
  const where = redactUrl(url);
  if (status === 429) {
    return new Error(openAlexKey()
      ? `OpenAlex rate/budget limit (HTTP 429) — your key's daily budget is spent; resets midnight UTC`
      : `OpenAlex budget exhausted (HTTP 429) — keyless requests share $0.10/day across this IP. `
        + `A free key gives $1/day: set CITEKIT_OPENALEX_KEY. Resets midnight UTC`);
  }
  if (status === 401 || status === 403) {
    return new Error(`OpenAlex rejected the API key (HTTP ${status}) at ${where} — check `
      + `~/.config/citekit/openalex.key or unset CITEKIT_OPENALEX_KEY to run keyless`);
  }
  return new Error(`HTTP ${status} for ${where}`);
}
let _LL = null;
function oaToRecord(w) {
  try {
    // LL is loaded lazily; the shim is only needed for the mapping function.
    if (!_LL) return { title: w.display_name || w.title || '(untitled)', abstract: unInvert(w.abstract_inverted_index), type: w.type };
    return _LL.openAlexToRecord(w);
  } catch { return { title: w.display_name || '(untitled)', abstract: '', type: w.type }; }
}

// Local inverse-index expander, used only if LL is unavailable (kept identical in behaviour).
function unInvert(inv) {
  if (!inv) return '';
  const words = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) words[p] = w;
  return words.join(' ').trim();
}

export async function initLL() {
  try { _LL = await loadLL(); } catch { _LL = null; }
  return !!_LL;
}

/* ============================ CLI ============================ */

const args = process.argv.slice(2);
const cmd = args[0];
const flag = f => args.includes(f);

async function main() {
  if (cmd === 'doi') {
    const doi = args[1];
    if (!doi) { console.error('usage: node tools/fidelity.mjs doi <DOI>'); process.exit(2); }
    await initLL();
    const out = await checkDoi(doi);
    console.log(JSON.stringify(out, null, 2));
    if (out.retraction.status === 'retracted') console.log('\n\u26a0 RETRACTED');
    return;
  }

  if (cmd === 'screen') {
    const dois = args.slice(1).filter(a => !a.startsWith('--'));
    if (!dois.length) { console.error('usage: node tools/fidelity.mjs screen <DOI> [DOI...]'); process.exit(2); }
    const m = await screenDois(dois);
    for (const d of dois.map(strip)) {
      const v = m.get(d.toLowerCase());
      const label = v ? v.status + (v.noticeType ? ` (${v.noticeType})` : '') : 'not found in OpenAlex';
      console.log(`${v && v.status === 'retracted' ? '\u26a0' : ' '} ${d}  \u2014  ${label}`);
    }
    return;
  }

  if (cmd === 'draft') {
    const path = args[1];
    if (!path) { console.error('usage: node tools/fidelity.mjs draft <file.md>'); process.exit(2); }
    const fs = await import('node:fs');
    const r = auditDraft(fs.readFileSync(path, 'utf8'));
    console.log(`prose sentences: ${r.considered}`);
    console.log(`HARD: ${r.hard.length}   WARN: ${r.warn.length}   ADVISORY: ${r.advisory.length}\n`);

    const show = (label, list) => {
      if (!list.length) return;
      console.log(`--- ${label} ---`);
      for (const h of list) {
        console.log(`  ${h.reasons.join('; ')}`);
        console.log(`    ${h.sentence.replace(/\s+/g, ' ').slice(0, 180)}`);
      }
      console.log('');
    };
    show('HARD — says it is relaying; open the primary source', r.hard);
    show('WARN — more than one citation in one sentence', r.warn);
    show('ADVISORY — synthesis narrowed to a specific claim', r.advisory);

    if (flag('--strict') && r.hard.length) {
      console.error(`strict: ${r.hard.length} HARD relay(s)`);
      process.exit(1);
    }
    return;
  }

  if (cmd === 'cite') {
    const doi = args[1];
    if (!doi) { console.error('usage: node tools/fidelity.mjs cite <DOI>'); process.exit(2); }
    const rows = await citationContexts(doi, { limit: 8 });
    if (!rows.length) { console.log('no citation contexts returned (Semantic Scholar may not index this DOI)'); return; }
    console.log(`How this work is cited by others (${rows.length}):\n`);
    for (const r of rows) {
      console.log(`\u2022 ${r.citingTitle || '(untitled)'}${r.year ? ` (${r.year})` : ''}` +
        `${r.intents.length ? `  [${r.intents.join(',')}]` : ''}${r.influential ? '  *influential*' : ''}`);
      for (const c of r.contexts) console.log(`    \u201c${c.replace(/\s+/g, ' ').slice(0, 220)}\u201d`);
    }
    return;
  }

  if (cmd === 'claim') {
    const fs = await import('node:fs');
    const sub = args[1];
    const get = (name, dflt = '') => {
      const i = args.indexOf('--' + name);
      return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
    };
    const has = name => args.includes('--' + name);
    const ledgerPath = get('ledger', get('draft') ? get('draft') + '.claims.jsonl' : 'claims.jsonl');
    const read = () => {
      if (!fs.existsSync(ledgerPath)) return [];
      const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
      const out = [];
      let skipped = 0;
      for (const l of lines) {
        let o;
        try { o = JSON.parse(l); } catch { skipped++; continue; }
        if (!o || o.z) continue;                       // header line
        out.push(decodeRecord(o));
      }
      // A dropped line is a claim that silently stops being checked — the exact failure mode this
      // ledger exists to prevent, so it is reported rather than swallowed.
      if (skipped) {
        console.error(`warning: ${skipped} unparseable line(s) in ${ledgerPath} were ignored — `
          + `those claims are NOT being checked`);
      }
      return out;
    };

    if (sub === 'add') {
      const claim = get('text');
      if (!claim) { console.error('usage: node tools/fidelity.mjs claim add --text "..." [--doi D] [--author-year "X 2019"] --access full-text|abstract|via-secondary|not-read [--via S] [--load-bearing] [--verdict supports|refutes|not-enough-info|unclear] [--ledger F]'); process.exit(2); }
      let rec;
      try {
        rec = ledgerRecord({
          claim,
          source: { doi: get('doi'), authorYear: get('author-year'), title: get('title'), evidenceLine: get('evidence-line') },
          access: get('access', 'not-read'),
          via: get('via') || null,
          verdict: get('verdict', 'unclear'),
          loadBearing: has('load-bearing'),
          agent: get('agent', get('draft') || 'draft'),
        });
      } catch (e) { console.error(e.message); process.exit(2); }

      // Near-duplicate guard: without it, editing a claim's wording appends a second entry and the
      // old one silently keeps failing. --replace overwrites the near match instead.
      const existing = read();
      let near = null, nearScore = 0;
      for (const old of existing) {
        const s = similarity(old.claim, rec.claim);
        if (s > nearScore) { nearScore = s; near = old; }
      }
      if (near && nearScore >= RECONCILE.SAME && !claimDifferences(near.claim, rec.claim).length) {
        if (!has('replace')) {
          console.error(`near-duplicate of ${near.key} (similarity ${nearScore.toFixed(2)}) — `
            + `pass --replace to update that entry instead of appending a second one.`);
          process.exit(2);
        }
        const kept = existing.filter(e => e.key !== near.key);
        fs.writeFileSync(ledgerPath, kept.map(e => JSON.stringify(encodeCompact(e))).join('\n') + (kept.length ? '\n' : ''));
        fs.appendFileSync(ledgerPath, JSON.stringify(encodeCompact(rec)) + '\n');
        console.log(`replaced ${near.key} -> ${rec.key}  access=${rec.access}`);
        return;
      }
      fs.appendFileSync(ledgerPath, JSON.stringify(encodeCompact(rec)) + '\n');
      console.log(`added ${rec.key}  access=${rec.access}  line=${rec.evidence_line || '\u2014'}`);
      return;
    }

    if (sub === 'list' || sub === 'check') {
      const entries = read();
      if (!entries.length) { console.log(`no ledger at ${ledgerPath}`); return; }
      if (sub === 'list') {
        if (has('md')) { console.log(ledgerToMarkdown(entries)); return; }
        for (const e of entries) {
          console.log(`${e.key}  ${e.access.padEnd(13)} ${String(e.verdict).padEnd(14)} ${e.load_bearing ? 'LOAD-BEARING ' : ''}${e.source?.author_year || e.source?.doi || '\u2014'}`);
          console.log(`            ${e.claim.replace(/\s+/g, ' ').slice(0, 150)}`);
        }
        return;
      }
      const draftPath = get('draft');
      const draft = draftPath && fs.existsSync(draftPath) ? fs.readFileSync(draftPath, 'utf8') : '';
      const r = auditLedger(entries, { draft });
      console.log(`${r.stats.claims} claims \u00b7 ${r.stats.evidenceLines} evidence lines \u00b7 ${r.stats.evidenceLinesReadAtFullText} read at full text \u00b7 ${r.stats.viaSecondary} via secondary\n`);
      for (const f of r.failures) console.log(`  FAIL  ${f.why}\n        ${f.claim ? f.claim.replace(/\s+/g, ' ').slice(0, 130) : ''}`);
      for (const w of r.warnings) console.log(`  WARN  ${w.why}\n        ${w.claim ? w.claim.replace(/\s+/g, ' ').slice(0, 130) : ''}`);
      if (!r.failures.length) console.log('  no failures');
      if (draftPath) {
        console.log(`\n  ${r.unaccounted.length} citation(s) in the draft have no ledger entry ` +
          `\u2014 a completeness backlog, not errors.`);
        for (const u of r.unaccounted.slice(0, 12)) console.log(`    \u00b7 ${u.label}`);
        if (r.unaccounted.length > 12) console.log(`    \u2026 and ${r.unaccounted.length - 12} more`);

        // Reconciliation — the gap that made a stale entry fail silently.
        const rc = reconcile(entries, draft);
        console.log(`\n  reconciliation against ${rc.candidates} draft claim(s):`);
        console.log(`    ${rc.matched.length} matched \u00b7 ${rc.drifted.length} drifted \u00b7 ${rc.stale.length} stale \u00b7 ${rc.unmatchedDraft.length} draft claims unledgered`);
        for (const d of rc.drifted) {
          console.log(`    DRIFTED (${d.score}) ${d.entry.key}`);
          console.log(`      ledger: ${d.entry.claim.replace(/\s+/g, ' ').slice(0, 110)}`);
          console.log(`      draft : ${d.draft.replace(/\s+/g, ' ').slice(0, 110)}`);
          for (const why of d.differences || []) console.log(`      \u26a0 ${why}`);
        }
        for (const s of rc.stale) {
          console.log(`    STALE   ${s.entry.key} \u2014 claim no longer in the draft (nearest ${s.score}):`);
          console.log(`      ${s.entry.claim.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
        if (has('strict-stale') && rc.stale.length) process.exit(1);
      }
      if (has('strict') && r.failures.length) process.exit(1);
      if (has('strict-incomplete') && r.unaccounted.length) process.exit(1);
      return;
    }

    console.error('usage: node tools/fidelity.mjs claim add|list|check ...');
    process.exit(2);
  }

  if (cmd === 'quotes') {
    const fs = await import('node:fs');
    const path = args[1];
    const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : ''; };
    const corpusDir = flag('corpus');
    let mapPath = flag('map');
    const online = args.includes('--online');
    if (!path) { console.error('usage: node tools/fidelity.mjs quotes <draft.md> --corpus <dir> | --online [--map f.json]'); process.exit(2); }
    // Auto-discover a map committed beside the draft. Keeping it in the repository is the point:
    // the map is the one input that cannot be derived, so it has to be reviewable and shareable
    // rather than living in one agent's shell history.
    if (!mapPath) {
      const { dirname, join } = await import('node:path');
      const beside = join(dirname(path), 'citations.map.json');
      if (fs.existsSync(beside)) mapPath = beside;
    }
    if (!corpusDir && !online) {
      console.error('give --corpus <dir> (local source texts) and/or --online (fetch sources by DOI/URL).');
      process.exit(2);
    }
    let corpus = '';
    let nFiles = 0;
    if (corpusDir) {
      if (!fs.existsSync(corpusDir)) { console.error(`no such corpus dir: ${corpusDir}`); process.exit(2); }
      const files = fs.readdirSync(corpusDir).filter(f => /\.(txt|md|text)$/i.test(f));
      nFiles = files.length;
      corpus = files.map(f => fs.readFileSync(`${corpusDir}/${f}`, 'utf8')).join('\n\n');
    }
    let map = null;
    if (mapPath) {
      if (!fs.existsSync(mapPath)) { console.error(`no such map file: ${mapPath}`); process.exit(2); }
      try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')); }
      catch (e) { console.error(`map file is not valid JSON: ${e.message}`); process.exit(2); }
    }

    const md = fs.readFileSync(path, 'utf8');
    const r = online
      ? await quotesOnline(md, { map, corpusText: corpus })
      : quoteReport(md, corpus);

    console.log(`${r.total} inline quote(s) \u00b7 ${r.verified} verified \u00b7 ${r.notFound.length} not found `
      + `\u00b7 ${r.spliced ? r.spliced.length + ' SPLICED ' : ''}\u00b7 ${r.unverifiable ? r.unverifiable.length + ' unverifiable ' : ''}\u00b7 ${r.unattributed} unattributed `
      + `\u00b7 ${r.tooShort} too short`);
    console.log(`sources: ${nFiles} corpus file(s)${online ? ' + online resolution' : ''}${map ? ` + map ${mapPath.replace(process.env.HOME || '~', '~')}` : ''}`);
    console.log('(a quote is only checked when a citation sits in the same sentence; unattributed quotes are '
      + 'your own words or a prayer text, not claims about a source)\n');

    for (const x of r.results || []) {
      if (x.status === 'verified') {
        console.log(`  VERIFIED   [${x.via}${x.cite ? ' \u00b7 ' + x.cite : ''}] ${x.quote.replace(/\s+/g, ' ').slice(0, 90)}`);
      } else if (x.status === 'not-found') {
        console.log(`  NOT FOUND  [${x.cite}${x.url ? ' \u00b7 ' + x.url : ''}] ${x.quote.replace(/\s+/g, ' ').slice(0, 110)}`);
        if (x.part) console.log(`             missing fragment: ${x.part}`);
      } else if (x.status === 'unverifiable') {
        console.log(`  SKIPPED    [${x.cite}] ${x.why}`);
      }
    }
    if (process.argv.includes('--strict') && r.notFound.length) process.exit(1);
    const bw = openAlexBudgetWarning();
    if (bw) console.error('\n' + bw);
    return;
  }

  if (cmd === 'refs') {
    const fs = await import('node:fs');
    const path = args[1];
    if (!path) { console.error('usage: node tools/fidelity.mjs refs <draft.md>'); process.exit(2); }
    const s = citationSymmetry(fs.readFileSync(path, 'utf8'));
    console.log(`${s.entries} reference entries \u00b7 ${s.cited} in-text citations`);
    console.log(`  ${s.orphans.length} orphan citation(s) \u2014 cited but not in Sources`);
    for (const o of s.orphans.slice(0, 15)) console.log(`    \u00b7 ${o.label}`);
    console.log(`  ${s.uncited.length} uncited reference(s) \u2014 in Sources but never cited`);
    for (const u of s.uncited.slice(0, 15)) console.log(`    \u00b7 ${u.label}`);
    if (process.argv.includes('--strict') && (s.orphans.length || s.uncited.length)) process.exit(1);
    return;
  }

  if (cmd === 'sources') {
    const idx = await readSourceIndex();
    const rows = Object.entries(idx).sort((a, b) => b[1].chars - a[1].chars);
    if (!rows.length) { console.log('no cached sources yet — run: quotes <draft.md> --online'); return; }
    const tok = n => Math.round(n / 4.2);            // rough, but the comparison is the point
    const total = rows.reduce((s, [, m]) => s + m.chars, 0);
    console.log(`${rows.length} cached source(s), ${total.toLocaleString()} chars total\n`);
    for (const [url, m] of rows) {
      console.log(`  ${String(m.chars).padStart(8)} chars  ~${String(tok(m.chars)).padStart(6)} tok  ${m.via.padEnd(4)}  ${url.slice(0, 92)}`);
    }
    console.log('\nRead a passage, not a paper:  node tools/fidelity.mjs passage <url-substring> --grep "<regex>"');
    return;
  }

  if (cmd === 'passage') {
    const query = args[1];
    const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : ''; };
    const pattern = flag('grep');
    if (!query || !pattern) {
      console.error('usage: node tools/fidelity.mjs passage <url-substring> --grep "<regex>" [--context N] [--max N]');
      process.exit(2);
    }
    const hits = await findPassages(pdfCacheDir(), query === '-' ? '' : query, pattern, {
      context: +(flag('context') || 2), max: +(flag('max') || 20),
    });
    if (!hits.length) { console.log(`no line matching /${pattern}/i in cached sources for "${query}"`); return; }
    let chars = 0;
    for (const h of hits) {
      console.log(`\n${h.url.slice(0, 92)}  line ${h.line}`);
      console.log(h.text);
      chars += h.text.length + h.url.length;
    }
    console.log(`\n${hits.length} passage(s), ~${Math.round(chars / 4.2)} tokens. `
      + `The whole source would have been ~${Math.round((await readSourceIndex())[hits[0].url]?.chars / 4.2 || 0)} tokens.`);
    return;
  }

  console.log(`fidelity — citation-integrity checks

  node tools/fidelity.mjs doi <DOI>            retraction + claim scope for one work
  node tools/fidelity.mjs draft <file.md>      audit prose for second-hand attribution
      --strict                                 exit 1 if any HARD relay is present

Base rates this exists for:
  major quotation error  11.9%   Jergas & Baethge 2015, PeerJ (28 studies)
  unsupported assertions 26.01%  Martella et al. 2021, RER 91(2):272-308
  articles with >=1       34.77%  same study, 1,090 articles citing Freeman et al. (2014)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
