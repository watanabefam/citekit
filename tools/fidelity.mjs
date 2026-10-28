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

import { loadLL } from './load-ll.mjs';

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

// Author-year pairs cited in a draft, for the cited-but-never-read check.
export function citedAuthorYears(markdown = '') {
  const out = [];
  const seen = new Set();
  const text = String(markdown).replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ');
  for (const m of text.matchAll(CITE_SCHOLAR)) {
    if (NOT_A_NAME.has(m[1])) continue;
    const name = m[1].replace(/^the\s+/i, '').trim();
    if (!/[A-Za-z]{3,}/.test(name)) continue;
    const key = `${name} ${m[2]}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, year: m[2], label: `${name} ${m[2]}` });
  }
  return out;
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

/* ============================ 6. how a paper is actually cited ============================ */

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
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

export async function fetchCrossref(doi) {
  const d = strip(doi);
  if (!d) return null;
  return getJSON(`https://api.crossref.org/works/${encodeURIComponent(d)}`);
}

export async function fetchOpenAlex(doi) {
  const d = strip(doi);
  if (!d) return null;
  return getJSON(`https://api.openalex.org/works/doi:${encodeURIComponent(d)}`);
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
  return {
    doi: strip(doi),
    title: rec?.title || (cr?.message?.title || [])[0] || null,
    retraction: verdict,
    scope: rec ? claimScope({ ...rec, type: oa.type }) : null,
  };
}

/* --- batched screening ---------------------------------------------------------------
   Probed 2026-10-29: OpenAlex accepts a pipe-separated doi filter with select, so 3 DOIs came
   back in ONE call at cost_usd 0.0001. Screening a 20-result search therefore costs one metered
   call, not twenty. Screen cheap, then fetch Crossref detail only for the flagged ones.
   URL builder and response mapper are split out as pure functions so they test without network. */
export function screenUrl(dois, perPage = 50) {
  const list = (Array.isArray(dois) ? dois : [dois]).map(strip).filter(Boolean);
  if (!list.length) return null;
  return 'https://api.openalex.org/works?filter=doi:' + list.map(encodeURIComponent).join('|')
    + '&select=doi,type,is_retracted&per-page=' + perPage;
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
  const url = screenUrl(dois);
  if (!url) return new Map();
  const json = await getJSON(url);
  return json ? mapScreenResponse(json) : new Map();
}

// Reuse CiteKit's own normaliser so this tool cannot drift from the app.
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
    const read = () => fs.existsSync(ledgerPath)
      ? fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];

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
      fs.appendFileSync(ledgerPath, JSON.stringify(rec) + '\n');
      console.log(`added ${rec.key}  access=${rec.access}  line=${rec.evidence_line || '\u2014'}`);
      return;
    }

    if (sub === 'list' || sub === 'check') {
      const entries = read();
      if (!entries.length) { console.log(`no ledger at ${ledgerPath}`); return; }
      if (sub === 'list') {
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
      }
      if (has('strict') && r.failures.length) process.exit(1);
      if (has('strict-incomplete') && r.unaccounted.length) process.exit(1);
      return;
    }

    console.error('usage: node tools/fidelity.mjs claim add|list|check ...');
    process.exit(2);
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
