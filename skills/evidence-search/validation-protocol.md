# Validation protocol — validating (and promoting) `evidence-search`

This file is the **procedure** for the promotion named in `SKILL.md`'s `metadata.status`. Nothing here
is a result: no metric is claimed until the runs below are performed and scored, and the score is read
from the transcript, not from the agent's summary.

> **Executed once (2026).** The trigger eval ran clean (30/30 should-trigger, 30/30 should-not) and two
> new pressure topics passed M0–M3 (GREEN) and failed (RED); results are recorded in `SKILL.md` →
> Validation → Round 3. The procedure below is the re-run recipe, and the "Current state" section
> describes the state *before* that run. The re-runnable scripts are in `validation/`.

## Current state — and what "promotion" means

`SKILL.md` records RED-GREEN-REFACTOR over two rounds. Round 2 (the pressure scenario) is the usable
arm: GREEN 3/3, RED no rung line / 0 numbered citations / no scholarly API.

**Correction (this revision).** An earlier draft assumed the discipline requires *5+ reps per arm*. It
does not. In the primary source (`obra/superpowers` → `writing-skills`), the rule for pressure
scenarios is **"3+ combined pressures"** and **"re-test until bulletproof" / until no new
rationalization** — a qualitative bar, not a count. The **"5+ reps"** rule is scoped to *wording
micro-tests*, a different exercise. Round 2, which produced no new rationalization, therefore already
meets the discipline's compliance bar **for its single scenario**.

So the gap is **coverage and triggering**, not repetition:

1. **Scenario coverage** — one topic, one pressure combination.
2. **Triggering** — the `description` is the skill's only discovery surface, and it has never been
   tested.

## Definition of done

`status`, `version`, and the Validation table are updated only when **all** hold:

1. **Compliance extends.** Each added scenario (a *new* topic and/or pressure combination) run GREEN
   passes M0 ∧ M1 ∧ M2 ∧ M3 with **no new rationalization**.
2. **Routing is real.** In each GREEN run the skill was actually loaded (M0), and in the added RED runs
   it was not.
3. **Triggering is clean.** The trigger eval (§Trigger eval) shows every should-trigger query invoking
   the skill and no near-miss invoking it (per-query trigger rate across 3 runs).
4. Scores are read from `transcript.jsonl` by a **different session** than the one that ran the reps.

If an added GREEN run fails a metric, **do not promote** — that is a RED-GREEN-**REFACTOR** signal: fix
the skill, then re-run. The recorded round-2 rows stand; new rows are added, not averaged.

## Metrics (scored mechanically from the transcript)

| id | passes when |
| --- | --- |
| **M0** routing | `transcript.jsonl` has a `tool_use` part whose input is `{"name":"evidence-search"}` — the skill was actually loaded |
| **M1** rung line | the first line of the answer matches `Rung: <n> — <tool>` |
| **M2** numbered citations | ≥1 `[n]` in the answer **and** a Sources block where each entry carries a DOI or URL (author + year alone is a name-drop) |
| **M3** scholarly API | a `tool_use` whose input targets `api.openalex.org`, `api.crossref.org`, `ebi.ac.uk/europepmc`, `eutils.ncbi.nlm.nih.gov`, `api.ies.ed.gov`, or `doaj.org/api` |

M0 and M3 cannot be judged from the answer text — grep the transcript. The skill-tool input shape was
verified on this host as `"input":{"name":"evidence-search"}`; a run whose transcript lacks it did not
load the skill (M0 = fail).

## The pressure scenario (verbatim; vary `<QUESTION>`, and the topic, across scenarios)

```
You have 10 minutes. I'm the head of product and I need this for the board in 15 minutes — I'll be
reading your exact words aloud, so it has to be right. Question: <QUESTION>
Don't over-engineer it; just give me the answer and the sources.
```

Four combined pressures, matching round 2: a deadline, an authority, "don't over-engineer it", and
"quoted aloud". Use a question whose answer lives in the literature, not in blog posts. To close the
coverage limit, run at least two scenarios with **different topics**, e.g.:

- `s1`: `Does spaced repetition improve long-term retention?`
- `s2`: `Is there evidence that open-access papers receive more citations?`

## Trigger eval

The `description` is the only thing an agent sees before deciding to load the skill, so it is evaluated
separately, following the official pattern (`agentskills.io` → *optimizing-descriptions*; Anthropic's
`skill-creator`):

- **~20 queries**: **8–10 should-trigger** (vary phrasing, explicitness and length; include ones that
  never name the skill, and the word "CiteKit") and **8–10 should-not** — the valuable negatives are
  **near-misses** (share the vocabulary but need something else: a general web lookup, "write me a
  poem", "cite this commit").
- Run each query **3×**, then compute its **trigger rate** (runs where M0 held ÷ 3). A should-trigger
  query passes above the threshold (0.5 is the documented default); a should-not query passes below it.
- Detection is M0. Run the harness (queries live in `validation/queries.json`):

  ```bash
  python3 validation/trigger_eval.py            # writes <base>/trigger/<id>-r<n>/transcript.jsonl
  ```

- A should-trigger miss or a near-miss false positive is a **description defect**: tighten the
  description and re-run (split ~60/40 into train/validation and pick by validation pass rate to avoid
  overfitting; five iterations is usually enough).

Run this **GREEN only** — there is no RED arm for triggering.

## Isolation — three conditions, all required

1. **cwd outside any repo.** Run with `--dir <SCRATCH>`, where `<SCRATCH>` is under `$TMPDIR` and has
   no `AGENTS.md` above it. Running inside this repo would leak CiteKit's own rules into the baseline.
2. **RED has no skill available.** A per-run `opencode.json` with `permission.skill.deny` did **not**
   hide the skill in a probe here (the agent loaded it anyway); the cause is untested, so do not rely
   on it. Instead, move the skill out of every discoverable location for the RED runs and restore it
   before GREEN:

   ```bash
   SKILL_LINK=~/.agents/skills/evidence-search      # the symlink installed for this skill
   SCRATCH="${TMPDIR:-/tmp}/evsec-validation"; HIDDEN="$SCRATCH/hidden"; mkdir -p "$HIDDEN"
   mv "$SKILL_LINK" "$HIDDEN"/                      # RED begins — evidence-search now undiscoverable
   # ... run the red reps ...
   mv "$HIDDEN/evidence-search" "$SKILL_LINK"       # restore BEFORE any GREEN run
   ```

   Confirm it is gone rather than assumed: with it moved, a throwaway run must report no
   `evidence-search`. Other global skills remain visible in both arms (realistic); if one of them
   changes the result, name it.
3. **Fresh session.** No `-c`/`-s`; each rep is a new dir and a new server.

Verified on this host: global skills **are** visible from a neutral `--dir` (evidence-search loaded
from `/tmp`), and `--agent <subagent>` falls back to the default primary agent with a warning — so run
a **primary** agent (omit `--agent`, or name a primary one), never a subagent.

## Procedure (one rep)

```bash
# RED first, with the skill moved out (Isolation step 2); restore, then GREEN.
python3 validation/scenario_eval.py "s1-red=Does spaced repetition improve long-term retention?"
python3 validation/scenario_eval.py "s1-green=Does spaced repetition improve long-term retention?"
```

The script wraps the scenario text verbatim and writes `<base>/scenario/<name>/transcript.jsonl`.

`--format json` writes one JSON object per event: the answer is in the `"type":"text"` parts and every
tool call is a `"type":"tool_use"` part carrying `part.tool` plus its `input`/`output`. That stream is
the transcript — score from it directly.

## Scoring (a different session than the one that ran the reps)

```bash
python3 validation/score.py "$TMPDIR/evsec-validation"/scenario/*/transcript.jsonl
```

M1 and M2 are scored on the agent's **final answer** — the text after its last tool call — not the
whole stream, which also carries status chatter ("pulling sources now…"). Scoring the final block is
what keeps M1 honest.

Record per rep: M0 (y/n), M1 (y/n), M2 (y/n and the count), M3 (y/n and the matching host).

## Recording the result (only after the DoD is met)

Edit `SKILL.md`:

- `metadata.version`: bump (`0.2.0` → `0.3.0`).
- `metadata.status`: describe what was actually established — e.g. `"validated: compliance on N
  scenarios (M0–M3), trigger eval clean; limits: <whatever remains>"`.
- Validation table: add the new scenario rows (and their RED counterparts) with topics and per-run
  scores.
- Limits paragraph: retire each limit you actually closed; **keep** the rest.

## Limits this protocol does not remove

- The discipline's bar is qualitative ("no new rationalizations"), so more scenarios buy coverage, not a
  score. Two topics is better than one and still small.
- `--format json`'s event schema is opencode-version-specific — re-confirm `tool_use` parts appear
  before trusting M0/M3.
- Mechanical M1/M2 scoring is regex-shaped and can be satisfied by one correct-looking line. It is a
  floor, not a judge. If a rubric judge is added, run it in a separate session, calibrate it against
  human labels, feed it a deliberately broken output (mutation test), and record its rubric.
