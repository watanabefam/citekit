// tests/fidelity.mjs — golden set for tools/fidelity.mjs
//
// Every fixture here is a REAL defect from a real document, or a real sentence that must NOT
// fire. The cases are the six defects found in family/habits/prayer.md on 2026-10-29, which is
// why they are worth keeping: they were all invisible to retrieval, all produced by a competent
// secondary source, and all missed on first reading.
//
// The pure classifiers need no network. Three live checks run only with --live.
//
//   node tests/fidelity.mjs           # offline golden set
//   node tests/fidelity.mjs --live    # + retraction probes against Crossref/OpenAlex

import {
  classifyRetraction, detectAttributions, claimScope, auditSentence, auditDraft, checkDoi,
} from '../tools/fidelity.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}${detail ? '  \u2014 ' + detail : ''}`); }
};
const section = t => console.log(`\n${t}`);

/* =====================================================================================
   1. RETRACTION — fixtures are recorded API payloads, trimmed to the fields that matter.
   These exact shapes were probed live on 2026-10-29 and are the reason the classifier has
   three signals rather than one.
   ===================================================================================== */
section('1. retraction classifier');

// Probed: Crossref returns NOTHING retraction-related for this work — no update-to, no
// updated-by, no relation. Only the title prefix reveals it. A Crossref-only check misses it.
const CHEST_CROSSREF = {
  message: {
    title: ['RETRACTED: Effects of Omega-3 Polyunsaturated Fatty Acids on Inflammatory Markers in COPD'],
    type: 'journal-article',
    relation: {},
  },
};
const CHEST_OPENALEX = { is_retracted: true, type: 'article' };
let v = classifyRetraction({ crossref: CHEST_CROSSREF, openalex: CHEST_OPENALEX });
ok(v.status === 'retracted', 'Chest 2005 (retracted 2008) is detected', v.status);
ok(v.evidence.includes('crossref:title-prefix'), 'title-prefix signal fires', JSON.stringify(v.evidence));
ok(v.evidence.includes('openalex:is_retracted'), 'OpenAlex signal fires', JSON.stringify(v.evidence));

// The load-bearing negative: Crossref alone would NOT catch it. If this ever passes, the
// title-prefix branch has been removed and a real retraction class has gone blind.
v = classifyRetraction({ crossref: CHEST_CROSSREF, openalex: null });
ok(v.status === 'retracted' && v.evidence.join() === 'crossref:title-prefix',
  'Crossref alone still catches it via title prefix (regression guard)', JSON.stringify(v));

// Probed: the Wakefield notice carries update-to with source retraction-watch, and the notice
// DOI differs by one character from the work's.
const NOTICE_CROSSREF = {
  message: {
    title: ['Retraction\u2014Ileal-lymphoid-nodular hyperplasia, non-specific colitis'],
    type: 'journal-article',
    'update-to': [{ DOI: '10.1016/s0140-6736(97)11096-0', type: 'retraction', source: 'retraction-watch' }],
    relation: {},
  },
};
v = classifyRetraction({ crossref: NOTICE_CROSSREF, openalex: null });
ok(v.status === 'is-a-notice', 'a notice is labelled is-a-notice, not retracted', v.status);
ok(v.noticeType === 'retraction', 'notice type read from update-to', v.noticeType);
ok(/retraction-watch/.test(v.evidence.join()), 'Retraction Watch provenance is recorded', v.evidence.join());
ok(v.noticeDoi === '10.1016/s0140-6736(97)11096-0', 'the work being retracted is named, not just the notice', v.noticeDoi);

// Probed: OpenAlex reports type "retraction" AND is_retracted: true for a retraction NOTICE.
// Treating the flag as "this work was retracted" mislabels every notice. This fixture is the
// regression guard for that bug — it was found by a live probe and must not need one to stay fixed.
const NOTICE_OPENALEX = {
  type: 'retraction',
  is_retracted: true,
  display_name: 'Retraction\u2014Ileal-lymphoid-nodular hyperplasia, non-specific colitis',
};
v = classifyRetraction({ crossref: NOTICE_CROSSREF, openalex: NOTICE_OPENALEX });
ok(v.status === 'is-a-notice', 'a notice carrying is_retracted is still a notice, not a retracted work', v.status);
ok(v.noticeType === 'retraction', 'notice type survives the OpenAlex merge', v.noticeType);

// A genuine work flagged by OpenAlex alone (Crossref silent) must still be caught.
v = classifyRetraction({ crossref: { message: { title: ['A paper'], relation: {} } }, openalex: { type: 'article', is_retracted: true } });
ok(v.status === 'retracted', 'OpenAlex alone catches a retracted article', v.status);

// A corrected work is not a retracted work.
v = classifyRetraction({ crossref: { message: { title: ['X'], 'update-to': [{ type: 'correction' }] } } });
ok(v.status === 'is-a-notice' && v.noticeType === 'correction', 'correction is not conflated with retraction', v.noticeType);

// Absence must never be reported as safety.
v = classifyRetraction({ crossref: { message: { title: ['A clean paper'], relation: {} } }, openalex: { is_retracted: false } });
ok(v.status === 'no-retraction-on-record', 'clean work reports "on record", not "safe"', v.status);
ok(typeof v.caveat === 'string' && /not proof/i.test(v.caveat), 'the caveat travels with the verdict');
ok(/^\d{4}-\d\d-\d\dT/.test(v.checkedAt), 'verdict is timestamped');

v = classifyRetraction({});
ok(v.status === 'not-checked', 'no payload reports not-checked, not a pass', v.status);

/* =====================================================================================
   2. ATTRIBUTION — the two real abstracts that matter.
   ===================================================================================== */
section('2. attribution detector');

// The abstract that caused four of the six defects. It reports Pew's figures in institutional
// form with no year, which is why the first prototype (scholarly form only) score zero on it.
const DOLLAHITE = `Research has found that intergenerational transmission of religiosity results in higher family
functioning and improved family relationships. Yet the Pew Research Center found that 44% of Americans reported
that they had left the religious affiliation of their childhood. And 78% of the expanding group of those who
identify as religiously unaffiliated ("Nones") reported that they were raised in "highly religious families."
We suggest that this may be, in part, associated with religious parents exercising excessive firmness with
inadequate flexibility. We used a multiphase, systematic, team-based process to code 8000+ pages of in-depth
interviews from 198 Christian, Jewish, and Muslim families.`;

let a = detectAttributions(DOLLAHITE);
ok(a.attributions.some(x => /Pew Research Center/.test(x.cite)), 'institutional attribution to Pew is found',
  JSON.stringify(a.attributions.map(x => x.cite)));
ok(a.attributions.every(x => x.form === 'institutional' || x.form === 'scholarly'), 'attribution form is labelled');
ok(a.selfReport === true, 'its own first-person findings are recognised');

// A paper reporting its own data must not be flagged.
const WILKINSON = `This study examines the associations between frequency of personal prayer, frequency of worship
attendance and spiritual wellbeing among 468 students attending fourth, fifth and sixth classes within 18 Church
of Ireland schools. The data demonstrate that frequency of personal prayer is a much stronger predictor than
frequency of worship attendance.`;
a = detectAttributions(WILKINSON);
ok(a.density === 0, 'an own-data abstract yields no attributions', JSON.stringify(a.attributions.map(x => x.cite)));

const LEE = `Seven patterns of family worship were detected by cluster analysis of questionnaires completed by 7,658
Seventh-day Adventist youth, grades 6 through 12. Worship patterns that actively involved youth in reading,
praying, and sharing their religious experience were rated as more meaningful and interesting.`;
a = detectAttributions(LEE);
ok(a.density === 0, 'Lee et al. reports its own cluster analysis, not others', JSON.stringify(a.attributions.map(x => x.cite)));

ok(detectAttributions('').flag === 'no-abstract', 'empty abstract is labelled, not silently passed');

/* =====================================================================================
   3. CLAIM SCOPE — driven by OpenAlex `type`, which was probed and does distinguish review.
   ===================================================================================== */
section('3. claim scope');

ok(claimScope({ type: 'review', title: 'The use of story to teach religious education' }).scope === 'secondary',
  'OpenAlex type "review" scopes as secondary');
ok(claimScope({ type: 'article', title: 'The use of story to teach religious education: a systematic review of the literature' }).scope === 'secondary',
  'a review-shaped title scopes as secondary even when typed article');
ok(claimScope({ type: 'article', title: 'Personal prayer, worship attendance and spiritual wellbeing', abstract: WILKINSON }).scope === 'primary?',
  'an own-data empirical paper scopes as primary?');
// Dollahite reports BOTH its own interview data and Pew's figures. That is genuinely mixed, and
// labelling it "secondary?" would overstate the case against it — the paper's own findings were
// sound; its summaries of others were not. The four-level ladder exists to keep that distinction.
ok(claimScope({ type: 'article', title: 'Beyond Religious Rigidities', abstract: DOLLAHITE }).scope === 'mixed?',
  'a paper with both own data and one external attribution scopes as mixed?');
ok(claimScope({ type: 'article', title: 'X', abstract: 'Smith et al. 2001 found A. Jones 2004 reported B. We examined C.' }).scope === 'secondary?',
  'two or more external attributions scope as secondary?');

/* =====================================================================================
   4. DRAFT AUDIT — the golden set of six real defects.
   Expected recall is stated per class and asserted, so a future change that quietly improves
   or degrades it fails here rather than passing unnoticed.
   ===================================================================================== */
section('4. draft audit \u2014 the six real defects');

const DEFECTS = [
  { id: 1, kind: 'attribution', expect: 'HARD',
    text: 'A study found that **compulsory family worship was more detrimental than no family worship at all** (Lee, Rice & Gillespie 1997, *Journal for the Scientific Study of Religion* 36: 372\u201381), as reported by Dollahite et al. (2019) and independently restated in Marks & Dollahite\u2019s review.' },
  { id: 2, kind: 'attribution', expect: 'SOME',
    text: 'And **78% of those who identify as religiously unaffiliated reported being raised in "highly religious families"** (Pew Research Center 2016).' },
  { id: 3, kind: 'attribution', expect: 'SOME',
    text: '**44% of Americans reported leaving the religious affiliation of their childhood** (Pew Research Center 2009, *Faith in Flux*).' },
  { id: 4, kind: 'attribution', expect: 'HARD',
    text: 'A landmark, **three-decade, longitudinal study with more than 3,000 participants** found that **warmth and closeness between parent and child significantly predicted whether children continued in the parents\u2019 faith** (Bengtson, Putney & Harris 2013, *Families and Faith*). \u2014 reported in **Research**, Dollahite et al. 2019' },
  { id: 5, kind: 'confidence', expect: 'SOME',
    text: 'Lally et al. (2010; 96 participants, 12 weeks): automaticity follows an asymptotic curve, **median 66 days** to 95% of asymptote, range **18\u2013254**.' },
  { id: 6, kind: 'confidence', expect: 'SOME',
    text: 'Deci, Koestner & Ryan (1999; 128 studies): engagement-contingent **d = \u22120.40**, completion-contingent **\u22120.36**, performance-contingent **\u22120.28**, with self-reported interest falling too.' },
];

const caught = { HARD: 0, ANY: 0 };
for (const d of DEFECTS) {
  const r = auditSentence(d.text);
  const any = !!r.level;
  if (r.level === 'HARD') caught.HARD++;
  if (any) caught.ANY++;
  const want = d.expect === 'HARD' ? r.level === 'HARD' : any;
  ok(want, `defect ${d.id} (${d.kind}) flagged${d.expect === 'HARD' ? ' HARD' : ''}`,
    `level=${r.level} reasons=${r.reasons.join('|') || 'none'}`);
}
console.log(`\n  recall: HARD ${caught.HARD}/6, any level ${caught.ANY}/6`);
ok(caught.HARD === 2, 'HARD recall is exactly 2/6 (the two relay-marked cases)');
ok(caught.ANY === 6, 'every one of the six real defects is flagged at some level');

/* --- precision: real sentences from the SAME document that must not fail a build --- */
section('4b. no false HARDs on correct prose');

const GOOD = [
  'The memorization of basic prayers offers an essential support to the life of prayer, but it is important to help learners savor their meaning.',
  'Practice testing (retrieving from memory) beats restudying: **g = 0.50**, with **81% of comparisons favouring testing** (Rowland 2014, *Psychological Bulletin*, **k = 159**).',
  '**Single exposure to a song gives no advantage over speech** (Calvert & Tart 1993; Rainey & Larsen 2002).',
  'Two independent secondary restatements agree \u2014 Dollahite et al. (2019) and Marks & Dollahite\u2019s review \u2014 but treat it as **reported-not-verified**.',
  '\u201c**To set about hunting down distractions would be to fall into their trap**\u201d \u2014 **Church**, CCC 2729',
];
for (const g of GOOD) {
  const r = auditSentence(g);
  ok(r.level !== 'HARD', `not HARD: ${g.slice(0, 62)}\u2026`, `level=${r.level} ${r.reasons.join('|')}`);
}

// A semicolon citation list inside ONE parenthetical is a list, not a relay.
let r = auditSentence('**Single exposure gives no advantage** (Calvert & Tart 1993; Rainey & Larsen 2002; Kilgour et al. 2000).');
ok(r.level !== 'WARN', 'one parenthetical with a citation list is not a WARN', `level=${r.level} groups=${r.groups}`);

// Two SEPARATE parentheticals is the "X says Y found Z" shape.
r = auditSentence('The effect is real (Smith 2001) and was replicated later (Jones 2004).');
ok(r.level === 'WARN', 'two separate citation groups raise a WARN', `level=${r.level} groups=${r.groups}`);

// "according to our own will" is quoted liturgical text, not an attribution.
r = auditSentence('It names "disappointment over not being heard according to our own will" among the difficulties.');
ok(r.level !== 'HARD', 'lowercase "according to" is not an attribution', `level=${r.level}`);

/* --- declared provenance must be downgraded, not silenced, and must not fail a build --- */
section('4c. declared provenance is not punished');

const DECLARED = [
  'Parental piety will not compensate for a distant dad (Bengtson, quoted in a review of the book, verified at primary source).',
  'The anti-rigidity case rests on one second-hand citation (Hansen 1998, via Dollahite only).',
  'Compulsory worship was worse than none (Lee et al. 1997), as reported by Dollahite (2019) \u2014 abstract only, body not read.',
];
for (const d of DECLARED) {
  const rr = auditSentence(d);
  ok(rr.level !== 'HARD', `declared provenance does not fail the build: ${d.slice(0, 54)}\u2026`, `level=${rr.level}`);
}
// ...but the disclosure must be visible, so an UNDECLARED relay still fails.
let rr = auditSentence('Compulsory worship was worse than none (Lee et al. 1997), as reported by Dollahite (2019).');
ok(rr.level === 'HARD', 'an UNDECLARED relay still fails \u2014 the point is declaration, not silence', `level=${rr.level}`);

/* =====================================================================================
   5. DRAFT-LEVEL behaviour, incl. that tables / headings / Sources are skipped.
   ===================================================================================== */
section('5. draft-level folding');

const DOC = `# Title

Prose sentence that is long enough to be considered by the auditor (Lee 1997), as reported by Dollahite et al. (2019).

| Claim | Source |
|---|---|
| \u201cCompulsory was worse than none\u201d (Lee et al. 1997), as reported by Dollahite (2019) | table row, must be skipped |

## Sources

- Lee, J. W. (1997). As reported in Dollahite et al. (2019). This line is in the bibliography and must be skipped.
`;
const dd = auditDraft(DOC);
ok(dd.hard.length === 1, 'exactly one HARD from the prose line', `got ${dd.hard.length}`);
ok(dd.considered >= 1 && dd.considered <= 3, 'table row and Sources block are excluded from the sentence count',
  `considered=${dd.considered}`);

/* =====================================================================================
   6. BATCHED SCREENING — the URL builder and mapper are pure, so this needs no network.
   Probed: 3 DOIs, one call, cost_usd 0.0001. Screening a 20-result search is one metered call.
   ===================================================================================== */
section('6. batched screening (pure)');

import { screenUrl, mapScreenResponse } from '../tools/fidelity.mjs';

const url = screenUrl(['10.1378/chest.128.6.3817', 'https://doi.org/10.3390/rel10020111', '']);
ok(/filter=doi:10\.1378%2Fchest\.128\.6\.3817\|10\.3390%2Frel10020111/.test(url),
  'DOIs are joined into one pipe-separated filter', url);
ok(/select=doi,type,is_retracted/.test(url), 'only the three needed fields are requested');
ok(screenUrl([]) === null, 'no DOIs yields no request');

const mapped = mapScreenResponse({
  results: [
    { doi: 'https://doi.org/10.1378/chest.128.6.3817', type: 'article', is_retracted: true },
    { doi: 'https://doi.org/10.3390/rel10020111', type: 'article', is_retracted: false },
    { doi: 'https://doi.org/10.1016/s0140-6736(10)60175-4', type: 'retraction', is_retracted: true },
  ],
});
ok(mapped.get('10.1378/chest.128.6.3817')?.status === 'retracted', 'a retracted article maps to retracted');
ok(mapped.get('10.1016/s0140-6736(10)60175-4')?.status === 'is-a-notice',
  'a notice maps to is-a-notice even though OpenAlex flags it retracted');
ok(mapped.get('10.3390/rel10020111')?.status === 'no-retraction-on-record', 'a clean record maps to on-record');

/* =====================================================================================
   7. CLAIM LEDGER — the six defects again, this time as ledger entries.
   The audit catches claims that ANNOUNCE they are second-hand. The ledger catches claims that
   are second-hand quietly, which is how the confidence class got in.
   ===================================================================================== */
section('7. claim ledger');

import { ledgerRecord, auditLedger, claimKey, citedAuthorYears, ACCESS, VERDICTS } from '../tools/fidelity.mjs';

// access defaults to the WORST truthful value, so forgetting fails closed
ok(ledgerRecord({ claim: 'x' }).access === 'not-read', 'access defaults to not-read (fails closed)');
ok((() => { try { ledgerRecord({ claim: 'x', access: 'skimmed' }); return false; } catch { return true; } })(), 'unknown access level is rejected');
ok(claimKey('The  same   claim!') === claimKey('the same claim'), 'claim keys ignore case, spacing and punctuation');

const LEDGER = [
  // 1. the Lee class — load-bearing, read only through Dollahite
  ledgerRecord({ claim: 'Compulsory family worship was more detrimental than no family worship at all',
    source: { authorYear: 'Lee 1997' }, access: 'via-secondary', via: 'Dollahite 2019', loadBearing: true }),
  // 2. the Pew class — a figure at via-secondary
  ledgerRecord({ claim: '78% of the unaffiliated were raised in highly religious families',
    source: { authorYear: 'Pew 2016' }, access: 'via-secondary', via: 'Dollahite 2019' }),
  // 3. the Bengtson class — a figure from an abstract
  ledgerRecord({ claim: 'Warmth predicted continuation across 3,000 participants',
    source: { authorYear: 'Bengtson 2013' }, access: 'abstract', loadBearing: true }),
  // 4. the Lally class — a body-text median from the abstract
  ledgerRecord({ claim: 'Automaticity reaches 95% of asymptote at a median 66 days',
    source: { authorYear: 'Lally 2010' }, access: 'abstract' }),
  // 5. the Deci class — cited, never opened
  ledgerRecord({ claim: 'Engagement-contingent rewards d = -0.40',
    source: { authorYear: 'Deci 1999' }, access: 'not-read' }),
  // a properly-handled claim, which must NOT fail
  ledgerRecord({ claim: 'Personal prayer predicted wellbeing r=.34 against r=.20 for attendance',
    source: { doi: '10.1007/s40839-018-0068-6', authorYear: 'Wilkinson 2018' },
    access: 'full-text', verdict: 'supports', loadBearing: true }),
];

let L = auditLedger(LEDGER);
ok(L.failures.length === 5, 'all five ledger-checkable defects fail', `got ${L.failures.length}: ${L.failures.map(f => f.why.slice(0, 40)).join(' | ')}`);
ok(L.failures.some(f => /load-bearing but seen only via/.test(f.why)), 'the Lee class is caught as load-bearing-via-secondary');
ok(L.failures.some(f => /states a figure/.test(f.why) && /abstract/.test(f.why)), 'the Lally/Bengtson class is caught as figure-from-abstract');
ok(L.failures.some(f => /not-read/.test(f.why)), 'the Deci class is caught as never opened');
ok(!L.failures.some(f => /Wilkinson/.test(JSON.stringify(f))), 'the properly-handled claim does not fail');
ok(L.stats.evidenceLines === 6 && L.stats.evidenceLinesReadAtFullText === 1,
  'stats expose evidence lines vs lines read at full text (SEPIO corroboration count)',
  JSON.stringify(L.stats));
ok(L.stats.viaSecondary === 2, 'via-secondary count is reported');

// via-secondary without naming the secondary is untraceable
const noVia = auditLedger([ledgerRecord({ claim: 'Something asserted', source: { authorYear: 'X 2001' }, access: 'via-secondary' })]);
ok(noVia.failures.some(f => /no secondary is named/.test(f.why)), 'via-secondary with no source named fails');

// a verdict may not exceed its evidence
const overreach = auditLedger([ledgerRecord({ claim: 'A finding', source: { authorYear: 'Y 2002' }, access: 'abstract', verdict: 'supports' })]);
ok(overreach.warnings.some(w => /verdict "supports"/.test(w.why)), 'a "supports" verdict on an abstract warns');

// cited-but-unledgered is a BACKLOG, not a failure — 52 of them would otherwise make the gate useless
const withDraft = auditLedger(LEDGER, { draft: 'We rely on Wilkinson 2018 and on Hansen 1998 and on Vermeer 2012.' });
ok(withDraft.unaccounted.some(u => /Hansen 1998/.test(u.label)), 'a citation absent from the ledger is reported as unaccounted');
ok(withDraft.unaccounted.some(u => /Vermeer 2012/.test(u.label)), 'and so is the second one');
ok(!withDraft.unaccounted.some(u => /Wilkinson 2018/.test(u.label)), 'a citation that IS in the ledger is not unaccounted');
ok(!withDraft.failures.some(f => /not in the ledger/.test(f.why || '')), 'unaccounted citations do NOT count as failures');

ok(citedAuthorYears('As Lee et al. 1997 found, and Dollahite (2019) agreed.').length === 2, 'author-year extraction finds both forms');
ok(citedAuthorYears('').length === 0, 'empty draft yields nothing');

/* =====================================================================================
   8. HOW A PAPER IS ACTUALLY CITED — pure mapper, needs no network.
   ===================================================================================== */
section('8. citation contexts (pure)');
import { citationContexts } from '../tools/fidelity.mjs';
ok(typeof citationContexts === 'function', 'citationContexts is exported');
ok(ACCESS.length === 4 && VERDICTS.length === 4, 'vocabularies are fixed-size and closed');

/* =====================================================================================
   9. LIVE (opt-in) — the probes this design rests on.
   ===================================================================================== */
if (process.argv.includes('--live')) {
  section('9. live probes');
  const chest = await checkDoi('10.1378/chest.128.6.3817');
  ok(chest.retraction.status === 'retracted', 'live: Chest 2005 detected retracted', chest.retraction.status);
  const notice = await checkDoi('10.1016/S0140-6736(10)60175-4');
  ok(notice.retraction.status === 'is-a-notice' && notice.retraction.noticeType === 'retraction',
    'live: Wakefield notice detected as a retraction notice', notice.retraction.status);
  const rev = await checkDoi('10.1007/s40839-021-00140-y');
  ok(rev.scope?.scope === 'secondary', 'live: OpenAlex types the story review as secondary', rev.scope?.scope);
} else {
  console.log('\n(skipping live probes; add --live to run them)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
