# Validation harness for `evidence-search`

Re-runnable implementation of [`../validation-protocol.md`](../validation-protocol.md). Stdlib-only
Python 3; no keys, no secrets. Everything writes to a scratch dir (default
`$TMPDIR/evsec-validation`), never into the repo.

## Run it

```bash
V=skills/evidence-search/validation

# 1. Triggering (GREEN only — the skill must be discoverable)
python3 "$V/trigger_eval.py"                 # all 20 queries x3, ~60 invocations

# 2. Compliance on a new pressure topic — run the RED arm with the skill hidden first
mv ~/.agents/skills/evidence-search /tmp/hidden/          # hide for RED
python3 "$V/scenario_eval.py" "s1-red=Does spaced repetition improve long-term retention?"
mv /tmp/hidden/evidence-search ~/.agents/skills/evidence-search   # RESTORE before GREEN
python3 "$V/scenario_eval.py" "s1-green=Does spaced repetition improve long-term retention?"

# 3. Score M0-M3 from the transcripts (a different session than the one that ran them)
python3 "$V/score.py" "$TMPDIR/evsec-validation"/scenario/s1-green/transcript.jsonl
```

## Notes

- **Isolation matters.** Each run uses its own `--dir` under `$TMPDIR` so no repo `AGENTS.md` leaks in.
  RED must actually hide the skill (a per-run `permission.skill.deny` does **not** work — see the protocol).
- **Triggering** uses one model at 3 runs/query; threshold 0.5. A `FAIL` line means a description defect.
- **Scoring** is mechanical and deliberately a floor: `M2` is regex-shaped and `M3` greps hostnames.
  Read the transcript, don't trust a summary.
- **Record results** in `../SKILL.md` → Validation (that is the source of truth, not this directory).
