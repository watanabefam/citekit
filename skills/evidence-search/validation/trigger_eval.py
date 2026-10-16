#!/usr/bin/env python3
"""Trigger eval — does the description make the agent load this skill?

Runs every query in queries.json N times (default 3) and reports a trigger rate per query, following
the agentskills.io "optimizing descriptions" pattern (20 queries, 3 runs each, threshold 0.5).

GREEN only: the skill must be discoverable (do NOT run this with the skill hidden).

Usage:
    python3 trigger_eval.py [--runs 3] [--workers 4] [--timeout 100] [--base DIR] [id ...]

Transcripts land in <base>/trigger/<id>-r<n>/transcript.jsonl. Detect triggering with score.py's M0,
or the built-in SIG check below.
"""
import argparse
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SIG = '"input":{"name":"evidence-search"}'  # the skill-tool call for this skill


def run_one(base, qid, rep, query, timeout):
    d = os.path.join(base, "trigger", f"{qid}-r{rep}")
    os.makedirs(d, exist_ok=True)
    t0 = time.time()
    with open(os.path.join(d, "err.log"), "w") as err:
        try:
            with open(os.path.join(d, "transcript.jsonl"), "w") as f:
                subprocess.run(["opencode", "run", "--dir", d, "--format", "json", query],
                               stdout=f, stderr=err, timeout=timeout)
        except subprocess.TimeoutExpired:
            pass
    dt = round(time.time() - t0, 1)
    try:
        fired = SIG in open(os.path.join(d, "transcript.jsonl")).read()
    except OSError:
        fired = False
    return fired, dt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="subset of query ids (default: all)")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--timeout", type=int, default=100)
    ap.add_argument("--base", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "evsec-validation"))
    a = ap.parse_args()

    queries = json.load(open(os.path.join(HERE, "queries.json")))
    if a.ids:
        want = set(a.ids)
        queries = [q for q in queries if q["id"] in want]

    hits = {q["id"]: 0 for q in queries}
    n = {q["id"]: 0 for q in queries}
    work = [(q, r) for q in queries for r in range(1, a.runs + 1)]

    def task(job):
        q, rep = job
        fired, dt = run_one(a.base, q["id"], rep, q["query"], a.timeout)
        return q, rep, fired, dt

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for q, rep, fired, dt in ex.map(task, work):
            hits[q["id"]] += 1 if fired else 0
            n[q["id"]] += 1
            print(f"{q['id']} rep{rep} fired={fired} secs={dt}", flush=True)

    print("\n-- trigger rates (threshold 0.5) --")
    failures = 0
    for q in queries:
        rate = hits[q["id"]] / n[q["id"]] if n[q["id"]] else 0.0
        ok = (rate > 0.5) == bool(q["should_trigger"])
        failures += 0 if ok else 1
        print(f"{q['id']} should_trigger={str(q['should_trigger']):5} rate={rate:.2f} {'ok' if ok else 'FAIL'}")
    print(f"\n{failures} failing quer{'y' if failures == 1 else 'ies'}")


if __name__ == "__main__":
    main()
