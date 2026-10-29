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
  similarity, reconcile, RECONCILE, encodeCompact, decodeRecord, ledgerToMarkdown,
  normaliseQuote, extractQuotes, verifyQuote, quoteReport, citationSymmetry,
  quotesOnline, stripHtml, citationLabelIn, citationLabelsIn, mapLookup, titleMatches,
  readSourceIndex, findPassages, screenUrls, openAlexKey, openAlexError,
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
section('9. compact ledger encoding');

{
  const full = {
    key: 'abc123def456',
    claim: 'Automaticity reaches 95% of asymptote at a median 66 days',
    asserted_by: 'habits/prayer.md', asserted_at: '2026-10-29T00:00:00.000Z',
    source: { doi: '10.1002/acp.1638', author_year: 'Lally 2010', title: 'How are habits formed' },
    access: 'abstract', via: null, evidence_line: 'Lally 2010', verdict: 'unclear', load_bearing: true,
  };
  const c = encodeCompact(full);
  const back = decodeRecord(c);
  ok(back.key === full.key && back.access === 'abstract' && back.load_bearing === true,
    'compact round-trips to the same assertion');
  ok(back.source.doi === '10.1002/acp.1638' && back.source.author_year === 'Lally 2010',
    'DOI and author-year survive');
  ok(back.verdict === 'unclear', 'an unclear verdict is omitted on disk and restored on read');
  ok(!('x' in c) && !('v' in c), 'default fields are omitted, not written as null');

  // Legacy verbose records must keep working: a ledger written before this change is still valid.
  const legacy = decodeRecord({ key: 'k1', claim: 'x', source: { doi: null, author_year: 'Pew 2016', title: null },
    access: 'not-read', via: null, evidence_line: null, verdict: 'unclear', load_bearing: false });
  ok(legacy.access === 'not-read' && legacy.source.author_year === 'Pew 2016',
    'legacy verbose records decode unchanged');

  // All four access levels must survive the enum encoding — a silently unmapped level would
  // downgrade to not-read and fail closed for the wrong reason.
  for (const [a, code, back2] of [['full-text','F','full-text'],['abstract','A','abstract'],
      ['via-secondary','S','via-secondary'],['not-read','N','not-read']]) {
    ok(encodeCompact({ ...full, access: a }).a === code && decodeRecord({ ...c, a: code }).access === back2,
      `access "${a}" encodes as "${code}" and decodes back`);
  }

  const md = ledgerToMarkdown([back]);
  ok(md.split('\n').length === 3 && md.includes('| abc123def456 |'), 'markdown view renders one row plus header');
  ok(md.includes("'Automaticity"), 'claim text is quoted so a pipe in prose cannot break the table');
}

section('10. similarity and reconciliation');

{
  // The three outcomes the CLI must distinguish, using the real corrected claims.
  const same = similarity(
    'Compulsory family worship was more detrimental than no family worship at all',
    'Compulsory family worship was more detrimental than no family worship at all.');
  ok(same >= RECONCILE.SAME, 'identical wording scores as SAME', String(same.toFixed(2)));

  const edited = similarity(
    'Automaticity reaches 95% of asymptote at a median 66 days',
    'Automaticity reaches 95% of asymptote at a median of 66 days');
  ok(edited >= RECONCILE.SAME, 'a one-word insertion still reads as the same claim', String(edited.toFixed(2)));

  const different = similarity(
    'Engagement-contingent rewards d = -0.40',
    'So treat the range as the claim, not a precise median, because it varies enormously');
  ok(different < RECONCILE.DRIFTED,
    'a short claim is NOT matched to a long unrelated sentence', String(different.toFixed(2)));

  const drift = similarity(
    'Warmth and closeness predicted continuation of family worship',
    'Warmth and closeness predicted continuation of family religious practice');
  ok(drift >= RECONCILE.DRIFTED, 'a substituted clause registers as DRIFTED, not SAME', String(drift.toFixed(2)));

  const entries = [
    { claim: 'Warmth and closeness predicted continuation; 3,000 participants over three decades', key: 'a' },
    { claim: 'Automaticity reaches 95% of asymptote at a median of 66 days', key: 'b' },
    { claim: '78% of the unaffiliated were raised in highly religious families', key: 'c' },
  ];
  const draft = [
    '# Part 3',
    '',
    'Warmth and closeness predicted continuation; 3,000 participants over three decades.',
    '',
    'Automaticity reaches 95% of asymptote at a median 66 days, per the fitted curve.',
    '',
    'A completely different paragraph about liturgical participation and singing.',
  ].join('\n');
  const r = reconcile(entries, draft);
  ok(r.matched.length === 1, 'the unchanged claim reconciles as MATCHED', `got ${r.matched.length}`);
  ok(r.drifted.length === 1 && r.drifted[0].entry.key === 'b',
    'the edited claim is reported as DRIFTED, not silently dropped');
  ok(r.stale.length === 1 && r.stale[0].entry.key === 'c',
    'a claim removed from the draft is reported STALE rather than failing silently');
  ok(r.unmatchedDraft.length === 1, 'the unrelated draft sentence is not claimed as a match');
}

section('11. quote normalisation (pagecite rules)');

{
  ok(normaliseQuote('The  Memorization\nof   basic prayers') === 'the memorization of basic prayers',
    'case, punctuation and whitespace are ignored');
  ok(normaliseQuote('the con-\nstraint hypothesis') === 'the constraint hypothesis',
    'a hyphenated line break is rejoined');
  ok(normaliseQuote('the \uFB01rst \uFB02ow') === 'the first flow', 'ligatures fold to plain letters');
  ok(normaliseQuote('3,200 families') === '3200 families', 'thousands separators normalise');
  ok(normaliseQuote('a value of 4.2') === 'a value of 4.2', 'a decimal point survives');
  ok(normaliseQuote('a value of 4.2') !== normaliseQuote('a value of 42'),
    'DECIMAL GUARD: 4.2 can never match 42 \u2014 the failure that silently verifies a wrong figure');
}

section('12. quote verification');

{
  const corpus = 'The memorization of basic prayers offers an essential support to the life of prayer,\n'
    + 'but it is important to help learners savor their meaning. The family is the first place\n'
    + 'where children learn to pray. Reported at 4.2 percent in the sample.';

  ok(verifyQuote('the memorization of basic prayers offers an essential support to the life of prayer', corpus).status === 'verified',
    'verbatim quote verifies');
  ok(verifyQuote('The Family Is The First Place Where Children Learn To Pray', corpus).status === 'verified',
    'case-different quote still verifies');
  ok(verifyQuote('the memorization of formal prayers offers a vital support to the life of prayer', corpus).status === 'not-found',
    'adjectives swapped = not found (the modified-quote class)');
  ok(verifyQuote('children who pray nightly are forty percent more likely to remain practicing', corpus).status === 'not-found',
    'a fabricated quotation is caught');
  ok(verifyQuote('a figure of 42 percent', corpus).status === 'not-found',
    'DECIMAL GUARD end-to-end: "42" does not verify against "4.2"');
  ok(verifyQuote('basic prayers', corpus).status === 'too-short',
    'under four words is refused rather than credited');

  const ell = verifyQuote('basic prayers \u2026 help learners savor their meaning', corpus);
  ok(ell.status === 'verified' && ell.parts === 2, 'an ellipsis verifies when both parts appear');
  const backwards = verifyQuote('savor their meaning \u2026 basic prayers', corpus);
  ok(backwards.status === 'not-found', 'ELLIPSIS ORDER: reversed parts must not verify');

  // Attribution gating: only a quote with a citation beside it is a claim about a source. Without
  // this the real document produced 34 "not found" flags, most of them its own emphasis.
  const doc = [
    'The Catechism says "the memorization of basic prayers offers an essential support to the life of prayer" (CCC 2688).',
    'So ask yourself "how do I motivate him?" and mean it.',
    'The words are "Our Father, who art in heaven" and they are prayed, not cited.',
    'A scare quote: the summary says "compulsory worship is worse than none" (Lee 1997), but no source says that.',
  ].join('\n');
  const qr = quoteReport(doc, corpus);
  ok(qr.verified === 1, 'the attributed quote verifies against the corpus', `verified=${qr.verified}`);
  ok(qr.notFound.length === 1 && /compulsory worship/.test(qr.notFound[0].quote),
    'a scare-quoted paraphrase is flagged as not found');
  ok(qr.unattributed === 2, 'a rhetorical question and a prayer text are unattributed, not failures',
    `unattributed=${qr.unattributed}`);
}

section('13. quote extraction');

{
  const md = [
    'Prose with "a real quotation of several words here" inline.',
    '```',
    'const x = "a quoted string inside code must be ignored";',
    '```',
    '| a | "a quoted string in a table must be ignored" |',
    '> a block quote is not scanned as an inline quote',
  ].join('\n');
  const q = extractQuotes(md);
  ok(q.length === 1, 'only the inline prose quotation is extracted', `got ${q.length}`);
  ok(/a real quotation/.test(q[0].quote), 'the extracted text is the right one');
  ok(extractQuotes('He said "tiny".')[0].tooShort === true, 'a three-word quote is flagged too short');

  // HARD-WRAP: markdown prose is wrapped, so a quotation routinely spans a newline. A line-by-line
  // scan returns nothing for these, which undercounts a document's quotations silently.
  const wrapped = 'The Catechism says "the memorization of basic prayers offers an essential\n'
    + 'support to the life of prayer" (CCC 2688).';
  const qw = extractQuotes(wrapped);
  ok(qw.length === 1, 'a quotation broken across a newline is still found', `got ${qw.length}`);
  ok(/essential support to the life of prayer/.test(qw[0].quote), 'the wrapped quote is reassembled whole');

  // Blockquotes carry the house style's most important quotations.
  const bq = '> "the memorization of basic prayers offers an essential support" — **Church**, CCC 2688';
  const qb = extractQuotes(bq);
  ok(qb.length === 1, 'a quotation inside a blockquote is found', `got ${qb.length}`);
  ok(/CCC 2688/.test(qb[0].context), 'the blockquote citation is kept as context');
}

section('14. citation / reference symmetry');

{
  const md = [
    '# Doc',
    '',
    'Findings (Dollahite & Thatcher 2008; Smith & Denton 2005) and a claim (Pew Research Center 2016).',
    'Tier label row: | Research, Dollahite 2019; §3.3a | must not create an author called Research.',
    'A mid-list capture: (Dollahite, Marks, Babcock, Barrow & Rose 2019) is Dollahite, not Babcock.',
    'Absent source (Nowhere 1999) is cited but never listed.',
    'Unused source is listed but never cited.',
    '',
    '## Sources',
    '',
    '- Dollahite, D. C., & Thatcher, J. Y. (2008). *Family religiosity*.',
    '- Smith, C., & Denton, M. L. (2005). *Soul Searching*.',
    '- Pew Research Center (2009). *Faith in Flux*. \u2014 and (2016). *Why America\'s nones left*.',
    '- Dollahite, D. C., Marks, L. D., Babcock, K. P., Barrow, B. H., & Rose, A. H. (2019). *Beyond religious*.',
    '- Calvert & Tart (1993); Rainey & Larsen (2002); Kilgour et al. (2000).',
    '- Chelladurai, J. M., Dollahite, D. C., & Marks, L. D. (2018). *The Family That Prays Together*.',
    '- Goldman, R. (1964). *Religious Thinking*. Routledge (reissued 2022).',
  ].join('\n');
  const s = citationSymmetry(md);

  ok(s.orphans.length === 1 && s.orphans[0].name === 'Nowhere',
    'exactly the one genuinely missing source is an orphan', JSON.stringify(s.orphans.map(o => o.label)));
  ok(!s.orphans.some(o => o.name === 'Research'), 'a tier label is not reported as an author');
  ok(!s.orphans.some(o => o.name === 'Babcock'), 'a mid-list capture is not reported as the surname');
  ok(!s.orphans.some(o => o.name === 'Reading'), 'an italic title is not reported as an author');
  ok(!s.orphans.some(o => o.name === 'Center'), 'an institution is matched by its full phrase, not its last word');
  ok(s.uncited.some(u => u.name === 'Chelladurai'), 'a listed-but-never-cited source is reported');
  ok(!s.uncited.some(u => /2022/.test(u.label)),
    'REISSUE YEAR: "(reissued 2022)" is not read as a second citation year');
  ok(s.uncited.filter(u => u.name === 'Goldman').length === 1,
    'the reissued book yields one entry (1964), not two');
  ok(!s.uncited.some(u => u.name === 'Kilgour'),
    'a semicolon-separated bullet lists every citation, not just the first');
}

section('15. online resolution (mocked fetch, no network)');

{
  ok(stripHtml('<p>Hello <b>world</b></p><script>bad()</script>').trim() === 'Hello world',
    'stripHtml removes tags and scripts');
  ok(/&/.test(stripHtml('a &amp; b')) && stripHtml('a &amp; b').includes('a & b'),
    'entities decode');

  // Citation nearest a quote, most specific first.
  ok(citationLabelIn('as shown (10.3102/0034654321991228)').value === '10.3102/0034654321991228',
    'a DOI is extracted');
  ok(citationLabelIn('see https://example.org/paper for this').kind === 'url', 'a URL is extracted');
  ok(citationLabelIn('the Catechism says (CCC 2688)').value === 'CCC 2688',
    'CCC with the word present is labelled CCC');
  ok(citationLabelIn('DGC §154 says so').value === 'DGC §154', 'DGC §N keeps its own label');
  // Proximity: a line can name both documents, and the one immediately before the § is the source.
  ok(citationLabelIn('the DGC text (DGC §154) agrees with the CCC here').value === 'DGC §154',
    'the source word nearest the § wins, not any source word in the line');
  ok(citationLabelIn('the CCC says so (CCC §2688)').value === 'CCC 2688',
    'CCC still wins when it is the nearest word');
  ok(citationLabelIn('see §3.2 above').value === '§3.2'.replace('.2', ''),
    'a bare cross-reference is NOT assumed to be the Catechism');

  // Map lookup, including the generic section source.
  const map = { CCC: 'https://ccc.example/a', '§': 'https://sections.example/b', 'Pew 2016': { url: 'https://pew.example/c' }, 'CCC 2727': 'https://ccc.example/p2727' };
  ok(mapLookup(map, 'CCC 2688').url === 'https://ccc.example/a', 'a section citation resolves via its source key');
  ok(mapLookup(map, '§2727').url === 'https://ccc.example/p2727',
    'a bare §N resolves to an explicitly filed "CCC N" entry');
  ok(mapLookup(map, '§154').url === 'https://sections.example/b', 'a bare § resolves via the generic key');
  ok(mapLookup(map, 'pew 2016').url === 'https://pew.example/c', 'map keys are case-insensitive');
  ok(mapLookup(map, 'Nowhere 1999') === null, 'an unmapped label resolves to nothing rather than guessing');

  // Title gate.
  ok(titleMatches('Attention Is All You Need', 'Attention Is All You Need: we propose the Transformer') === true,
    'the right document passes the title gate');
  ok(titleMatches('Attention Is All You Need', 'A study of tumour cell lines and proton relaxation') === false,
    'an unrelated document fails the title gate');

  // The cascade: candidate 1 is a wrong-but-fetchable document, candidate 2 is the real one.
  const WRONG = ('A study of proton spin-lattice relaxation in tumour cell lines. ').repeat(6);
  const QUOTE = 'we propose a new simple network architecture, the Transformer, based solely on attention mechanisms';
  const RIGHT = ('Attention Is All You Need. ' + QUOTE + '. ').repeat(4);
  const mock = async (url) => {
    if (url.includes('api.openalex.org')) {
      return new Response(JSON.stringify({
        title: 'Attention Is All You Need',
        open_access: { oa_status: 'green' },
        best_oa_location: { is_oa: true, pdf_url: 'https://wrong.example/x' },
        locations: [{ is_oa: true, pdf_url: 'https://wrong.example/x' }, { is_oa: true, pdf_url: 'https://right.example/y' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('wrong.example')) return new Response(WRONG, { status: 200, headers: { 'content-type': 'text/html' } });
    if (url.includes('right.example')) return new Response(RIGHT, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('nope', { status: 404 });
  };
  const fs = await import('node:fs');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(`${os.tmpdir()}/ck-`);
  const doc = `The paper states "${QUOTE}" (10.1234/test.2020).`;

  const good = await quotesOnline(doc, { fetchImpl: mock, cacheDir: tmp });
  ok(good.verified === 1, 'a quote verifies from the second candidate after the first is rejected',
    JSON.stringify(good.results.map(r => r.status)));
  ok(good.results[0].url === 'https://right.example/y', 'the URL used is the one that matched the title');
  ok(good.notFound.length === 0, 'rejecting a wrong copy does not produce a false "not found"');

  // The safety property: if ONLY the wrong copy exists, the answer must be "could not check".
  const onlyWrong = async (url) => url.includes('api.openalex.org')
    ? new Response(JSON.stringify({
        title: 'Attention Is All You Need', open_access: { oa_status: 'green' },
        best_oa_location: { is_oa: true, pdf_url: 'https://wrong.example/x' }, locations: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    : (url.includes('wrong.example')
        ? new Response(WRONG, { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response('nope', { status: 404 }));

  // Fresh cache dir: the OA lookup cache is keyed by DOI, so reusing one would serve the previous
  // scenario's answer and the test would pass or fail for the wrong reason.
  const tmp2 = fs.mkdtempSync(`${os.tmpdir()}/ck-oa2-`);
  const bad = await quotesOnline(doc, { fetchImpl: onlyWrong, cacheDir: tmp2 });
  ok(bad.notFound.length === 0 && bad.unverifiable.length === 1,
    'THE SAFETY PROPERTY: a wrong copy yields "unverifiable", never "not found"');
  ok(/title/i.test(bad.unverifiable[0].why || ''), 'the reason names the title mismatch');

  // A closed-access DOI is reported as such, not as a defect.
  const closed = async (url) => url.includes('api.openalex.org')
    ? new Response(JSON.stringify({ title: 'X', open_access: { oa_status: 'closed' }, locations: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('nope', { status: 404 });
  const tmp3 = fs.mkdtempSync(`${os.tmpdir()}/ck-oa3-`);
  const cl = await quotesOnline(doc, { fetchImpl: closed, cacheDir: tmp3 });
  ok(cl.unverifiable.length === 1 && /closed/.test(cl.unverifiable[0].why),
    'closed access is reported as unverifiable with its reason');

  // A sentence can cite several works. Checking a quotation against only the first one accused the
  // wrong author: "…the book reports that “…” (Pew 2009; Bengtson 2013)".
  const labels = citationLabelsIn('and the book reports that (Pew 2009; Bengtson 2013)');
  ok(labels.length === 2 && labels.some(l => l.value === 'Pew 2009' && labels.some(x => x.value === 'Bengtson 2013')),
    'every source in a multi-source citation becomes a candidate', JSON.stringify(labels.map(l => l.value)));

  const ABSENT = 'a sentence that is definitely not in the text at all';
  const plainText = ('Some other content entirely, nothing resembling the quotation. ').repeat(6);
  const citeMock = async (url) => (url.includes('a.example')
    ? new Response(plainText, { status: 200, headers: { 'content-type': 'text/html' } })
    : new Response('nope', { status: 404 }));

  // One source readable and lacking the quote, one source unmapped: cannot accuse, because the
  // quotation may belong to the source we could not read.
  const partial = await quotesOnline(`He wrote "${ABSENT}" (Pew 2009; Nowhere 1999).`, {
    map: { 'Pew 2009': 'https://a.example/x' }, fetchImpl: citeMock, cacheDir: tmp,
  });
  ok(partial.notFound.length === 0 && partial.unverifiable.length === 1,
    'UNREADABLE SIBLING: a readable source without the quote is not enough to accuse');
  ok(/Nowhere 1999/.test(partial.unverifiable[0].why || ''), 'the reason names the source not read');

  // Control: both sources readable and neither contains it, so the verdict is a real not-found.
  const both = await quotesOnline(`He wrote "${ABSENT}" (Pew 2009; Bengtson 2013).`, {
    map: { 'Pew 2009': 'https://a.example/x', 'Bengtson 2013': 'https://a.example/y' },
    fetchImpl: citeMock, cacheDir: tmp,
  });
  ok(both.notFound.length === 1, 'CONTROL: when every cited source was read, an absence is a real finding');
}

section('16. cached sources and passage retrieval');

{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(`${os.tmpdir()}/ck-src-`);
  fs.writeFileSync(`${dir}/aaa.txt`, [
    'The memorization of basic prayers offers an essential support.',
    'Filler line that should not be returned.',
    '2729 The habitual difficulty in prayer is distraction.',
    'More filler.',
  ].join('\n'));
  fs.writeFileSync(`${dir}/index.json`, JSON.stringify({
    'https://example.org/ccc': { file: 'aaa.txt', chars: 200, via: 'html', at: 'now' },
  }));

  const idx = await readSourceIndex(dir);
  ok(Object.keys(idx).length === 1, 'the index is readable');

  const hits = await findPassages(dir, 'example.org', 'habitual difficulty');
  ok(hits.length === 1, 'exactly the matching passage is returned', `got ${hits.length}`);
  ok(/distraction/.test(hits[0].text), 'the passage carries the matched text');
  const tight = await findPassages(dir, 'example.org', 'habitual difficulty', { context: 0 });
  ok(!/memorization/.test(tight[0].text), 'with context 0 only the matching line is returned');
  ok(/memorization/.test(hits[0].text), 'with context, neighbouring lines are included deliberately');
  ok(hits[0].line === 3, 'the line number is reported');

  const none = await findPassages(dir, 'example.org', 'no-such-phrase-anywhere');
  ok(none.length === 0, 'a miss returns nothing rather than the whole source');

  const filtered = await findPassages(dir, 'other.org', 'habitual difficulty');
  ok(filtered.length === 0, 'a query that matches no cached URL returns nothing');

  const capped = await findPassages(dir, '', '.', { max: 2 });
  ok(capped.length === 2, '--max bounds the output so it cannot become the whole document');
}

section('17. OpenAlex budget, batching and caching');

{
  const fs = await import('node:fs');
  const os = await import('node:os');
  // OpenAlex caps OR at 100 values and per_page at 100. Both were violated: >100 DOIs failed the
  // whole request, and per-page=50 silently truncated, so DOIs past the fiftieth looked clean.
  const many = Array.from({ length: 150 }, (_, i) => `10.1000/d${i}`);
  const urls = screenUrls(many);
  ok(urls.length === 2, 'a 150-DOI screen is split into two requests', `got ${urls.length}`);
  ok(urls[0].split('|').length === 100, 'the first chunk carries exactly the OR limit');
  ok(/per-page=100/.test(urls[0]), 'per_page matches the chunk size, so nothing is truncated');

  const dupe = screenUrls(['10.1000/a', '10.1000/a', '10.1000/a']);
  ok(dupe.length === 1 && dupe[0].split('|').length === 1, 'duplicate DOIs are collapsed before batching');
  ok(screenUrls([]).length === 0, 'no DOIs means no request at all');

  // Key support: keyless is $0.10/day shared across the IP; a free key is $1/day and 30 rps.
  const before = process.env.CITEKIT_OPENALEX_KEY;
  process.env.CITEKIT_OPENALEX_KEY = 'k-test-123';
  ok(/api_key=k-test-123/.test(screenUrl(['10.1000/x'])), 'the key is sent when one is configured');
  ok(openAlexKey() === 'k-test-123', 'the key is read from the environment');
  delete process.env.CITEKIT_OPENALEX_KEY;
  ok(!/api_key=/.test(screenUrl(['10.1000/x'])), 'no key, no api_key parameter');
  if (before !== undefined) process.env.CITEKIT_OPENALEX_KEY = before;

  // The key may live in a file (~/.config/citekit/openalex.key), matching the tavily.key
  // convention. This assertion exists because the first implementation used `require` in an ES
  // module inside a try/catch, which failed silently and never read the file at all.
  const homeBefore = process.env.HOME;
  const tmpHome = fs.mkdtempSync(`${os.tmpdir()}/ck-home-`);
  fs.mkdirSync(`${tmpHome}/.config/citekit`, { recursive: true });
  fs.writeFileSync(`${tmpHome}/.config/citekit/openalex.key`, 'file-key-456\n');
  process.env.HOME = tmpHome;
  delete process.env.CITEKIT_OPENALEX_KEY;
  ok(openAlexKey() === 'file-key-456', 'a key file is read when no env var is set', `got "${openAlexKey()}"`);
  process.env.CITEKIT_OPENALEX_KEY = 'env-wins';
  ok(openAlexKey() === 'env-wins', 'the env var takes precedence over the file');
  delete process.env.CITEKIT_OPENALEX_KEY;
  process.env.HOME = homeBefore;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  if (before !== undefined) process.env.CITEKIT_OPENALEX_KEY = before;

  ok(/budget exhausted/.test(openAlexError(429, 'u').message)
    && /CITEKIT_OPENALEX_KEY/.test(openAlexError(429, 'u').message),
    'a 429 names the cause and the fix instead of saying "HTTP 429"');
  ok(!/budget/.test(openAlexError(500, 'u').message), 'a non-429 error is not misdescribed as budget');

  // The OA lookup cache: second call must not re-fetch.
  const cdir = fs.mkdtempSync(`${os.tmpdir()}/ck-oa-`);
  let calls = 0;
  const counting = async (url) => {
    if (url.includes('api.openalex.org')) {
      calls++;
      return new Response(JSON.stringify({
        title: 'Cached Work', open_access: { oa_status: 'gold' },
        best_oa_location: { is_oa: true, pdf_url: 'https://c.example/p' }, locations: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('the cached work says something quotable here for the test', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const doc = `It says "something quotable here for the test" (10.9999/cache.me).`;
  await quotesOnline(doc, { fetchImpl: counting, cacheDir: cdir });
  const afterFirst = calls;
  await quotesOnline(doc, { fetchImpl: counting, cacheDir: cdir });
  ok(afterFirst === 1, 'the OA lookup is made once', `calls=${afterFirst}`);
  ok(calls === afterFirst, 'a second run is served from the OA cache', `calls=${calls}`);
  fs.rmSync(cdir, { recursive: true, force: true });
}

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
