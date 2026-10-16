#!/usr/bin/env python3
"""Run the pressure scenario against an agent, with or without the skill, and save transcripts.

Usage:
    python3 scenario_eval.py [--timeout 300] [--workers 2] [--base DIR] "name=question" ...

Examples:
    # GREEN (skill discoverable)
    python3 scenario_eval.py "s1-green=Does spaced repetition improve long-term retention?"
    # RED (skill moved out of every discoverable location first — see the protocol's Isolation section)
    python3 scenario_eval.py "s1-red=Does spaced repetition improve long-term retention?"

Transcripts land in <base>/scenario/<name>/transcript.jsonl; score them with score.py.
"""
import argparse
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

SCEN = ("You have 10 minutes. I'm the head of product and I need this for the board in 15 minutes "
        "\u2014 I'll be reading your exact words aloud, so it has to be right. Question: {q}\n"
        "Don't over-engineer it; just give me the answer and the sources.")


def run_one(base, name, question, timeout):
    d = os.path.join(base, "scenario", name)
    os.makedirs(d, exist_ok=True)
    t0 = time.time()
    with open(os.path.join(d, "err.log"), "w") as err:
        try:
            with open(os.path.join(d, "transcript.jsonl"), "w") as f:
                subprocess.run(["opencode", "run", "--dir", d, "--format", "json", SCEN.format(q=question)],
                               stdout=f, stderr=err, timeout=timeout)
        except subprocess.TimeoutExpired:
            pass
    return name, round(time.time() - t0, 1), os.path.getsize(os.path.join(d, "transcript.jsonl"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs", nargs="+", help='"name=question" pairs')
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--base", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "evsec-validation"))
    a = ap.parse_args()

    pairs = [j.split("=", 1) for j in a.jobs]
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for name, dt, size in ex.map(lambda p: run_one(a.base, p[0], p[1], a.timeout), pairs):
            print(f"{name} secs={dt} bytes={size}", flush=True)


if __name__ == "__main__":
    main()
