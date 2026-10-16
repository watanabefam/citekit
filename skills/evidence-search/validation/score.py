#!/usr/bin/env python3
"""Score M0-M3 for one or more opencode --format json transcripts, mechanically.

    M0 routing : the skill tool was called for this skill        (anywhere in the run)
    M1 rung    : the first line of the *answer* is `Rung: <n> - <tool>`
    M2 cites   : the answer has >=1 numbered citation AND a Sources block
    M3 API     : a tool call hit a scholarly API host            (anywhere in the run)

The "answer" is the agent's final message — the text that follows its last tool call — because the
run also streams intermediate status chatter ("pulling sources now...") that must not be mistaken for
the deliverable. Scoring off the final block is what keeps M1 honest.

Usage: python3 score.py <transcript.jsonl> [...]
"""
import json
import re
import sys

SIG = '"input":{"name":"evidence-search"}'
HOST = re.compile(r"api\.openalex\.org|api\.crossref\.org|ebi\.ac\.uk/europepmc|"
                  r"eutils\.ncbi\.nlm\.nih\.gov|api\.ies\.ed\.gov|doaj\.org/api")


def load_events(path):
    events = []
    for line in open(path):
        if line.strip():
            try:
                events.append(json.loads(line))
            except ValueError:
                pass
    return events


def answer_text(events):
    last_tool = max((i for i, e in enumerate(events) if e.get("type") == "tool_use"), default=-1)
    return "\n".join(
        (e.get("part") or {}).get("text", "")
        for i, e in enumerate(events)
        if i > last_tool and e.get("type") == "text" and (e.get("part") or {}).get("text")
    )


def score(path):
    raw = open(path).read()
    events = load_events(path)
    ans = answer_text(events)
    first_line = next((ln.strip() for ln in ans.splitlines() if ln.strip()), "")
    cites = len(re.findall(r"\[\d+\]", ans))
    hosts = sorted(set(HOST.findall(raw)))
    return {
        "M0": SIG in raw,
        "M1": first_line.startswith("Rung:"),
        "M2": cites > 0 and "sources" in ans.lower(),
        "M3": hosts,
        "first_line": first_line[:80],
        "cites": cites,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for path in sys.argv[1:]:
        s = score(path)
        print(f"{path}")
        print(f"  M0 routing : {s['M0']}")
        print(f"  M1 rung    : {s['M1']}  {s['first_line']!r}")
        print(f"  M2 cites   : {s['M2']}  ({s['cites']} numbered)")
        print(f"  M3 API     : {bool(s['M3'])}  {s['M3']}")


if __name__ == "__main__":
    main()
