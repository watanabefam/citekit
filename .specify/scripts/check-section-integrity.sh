#!/usr/bin/env bash
# check-section-integrity — assert a filled artifact still carries every section the resolved
# template requires, in the template's order.
#
# WHY THIS EXISTS
# The kit tells the agent, in prose, "do not drop, rename, reorder, or summarise any section the
# resolved file contains". That rule is READ, not OBEYED — a real run dropped two sections from a
# spec and nothing noticed; a dogfood run before that had spec.md silently missing its appended
# sections. Section PRESENCE is text, so unlike "is this section any good" it is machine-checkable,
# and a machine-checkable rule should not rest on prose alone. This is that check.
#
# WHAT IT DOES NOT DO
# It compares HEADINGS, not content: it cannot tell a well-filled section from a stub, and it does
# not judge whether a section that says `Not applicable — <reason>` is telling the truth. That limit
# is deliberate and stated rather than hidden.
#
# Usage: check-section-integrity.sh <project-root> <template-name> <artifact-file>
#   e.g. check-section-integrity.sh . spec-template specs/007-thing/spec.md
# Exit: 0 = conformant · 1 = missing or reordered sections · 2 = usage/setup error.
set -uo pipefail

PROJECT="${1:-}"; TEMPLATE="${2:-}"; ARTIFACT="${3:-}"
if [ -z "$PROJECT" ] || [ -z "$TEMPLATE" ] || [ -z "$ARTIFACT" ]; then
  echo "usage: $0 <project-root> <template-name> <artifact-file>" >&2
  echo "   e.g. $0 . spec-template specs/007-thing/spec.md" >&2
  exit 2
fi

RESOLVER="$PROJECT/.specify/scripts/bash/resolve-template.sh"
[ -f "$RESOLVER" ] || { echo "no resolve-template.sh under $PROJECT/.specify/scripts/bash" >&2; exit 2; }
[ -f "$ARTIFACT" ] || { echo "artifact not found: $ARTIFACT" >&2; exit 2; }

TMPD="$(mktemp -d)" || exit 2

if ! bash "$RESOLVER" "$TEMPLATE" > "$TMPD/template" 2>"$TMPD/err"; then
  echo "template '$TEMPLATE' did not resolve:" >&2
  sed 's/^/  /' "$TMPD/err" >&2
  rm -rf "$TMPD"; exit 2
fi

# Headings, normalised for comparison.
#
# A template heading carries guidance that is not part of the section's NAME, and the artifact is
# not supposed to copy it:
#   '### Key Entities *(include if feature involves data)*'       → italic note
#   '## Phase 1: Setup (Shared Infrastructure)'                   → descriptive parenthetical
#   '### Tests for User Story 1 (OPTIONAL - only if tests …) ⚠️'   → optional marker
# Comparing raw text made a fully conformant spec report '### Key Entities' as MISSING. A check
# that is wrong about something normal gets deleted, so the guidance is stripped from BOTH sides
# before comparing.
#
# Two things are excluded from `required` entirely:
#   - a heading containing '[' — a placeholder ('[PRINCIPLE_1_NAME]') or a removable block
#     ('[REMOVE IF USED]');
#   - a heading marked OPTIONAL — the template says the section may be absent, so demanding it
#     would assert the opposite of the document being validated.
normalize() {
  sed -e 's/[[:space:]]*$//' \
      -e 's/[[:space:]]*⚠️[[:space:]]*$//' \
      -e 's/[[:space:]]*([^)]*)[[:space:]]*$//' \
      -e 's/[[:space:]]*\*([^*]*)\*[[:space:]]*$//'
}

headings() {
  grep -E '^#{1,4}[[:space:]]' "$1" | sed -e '/\[/d' -e '/(OPTIONAL/d' | normalize
}

headings "$TMPD/template" > "$TMPD/required"
headings "$ARTIFACT"      > "$TMPD/found"

total=$(wc -l < "$TMPD/required" | tr -d ' ')
if [ "$total" -eq 0 ]; then
  # A resolver that silently returns a placeholder-only document must not read as "conformant".
  echo "  ERROR    template '$TEMPLATE' resolved with no required headings — refusing to report success" >&2
  rm -rf "$TMPD"; exit 2
fi

missing=0; disordered=0; cursor=0; index=0
while IFS= read -r want; do
  index=$((index + 1))
  # Find the FIRST occurrence strictly after the cursor. Searching from the top every time made a
  # repeated heading look reordered: tasks-template contains '### Worked example' twice, and the
  # second requirement found the first occurrence again, behind the cursor. Consuming occurrences
  # in order fixes that, and still detects a genuine move — which leaves `appears` set while
  # finding nothing ahead of the cursor.
  at=0; appears=0; n=0
  while IFS= read -r have; do
    n=$((n + 1))
    if [ "$have" = "$want" ]; then
      appears=1
      if [ "$n" -gt "$cursor" ]; then at=$n; break; fi
    fi
  done < "$TMPD/found"

  if [ "$at" -ne 0 ]; then
    cursor=$at
  elif [ "$appears" -eq 0 ]; then
    printf '  MISSING  %s\n' "$want"
    missing=$((missing + 1))
  else
    # Some sections are INSTRUCTED to move. The commands require `Document Status` directly after
    # the core metadata, and `Normative Status` / `Which document wins` / `Requirements Syntax
    # (EARS)` follow it — all ahead of where append-only composition puts them. Penalising the
    # reordering the kit itself mandates would make this check report failure on every conformant
    # spec, and a check that is wrong about something normal gets removed. Presence is still
    # required; only ORDER is waived for these four.
    # Names here are the NORMALISED form (guidance stripped), e.g. '## Requirements Syntax
    # (EARS)' arrives as '## Requirements Syntax'.
    case "$want" in
      "## Document Status"|"## Normative Status"|"### Which document wins"|"## Requirements Syntax")
        : ;;   # ordering waived by instruction; presence already verified above
      *)
        printf '  ORDER    %s  (found before an earlier-required section)\n' "$want"
        disordered=$((disordered + 1)) ;;
    esac
  fi
done < "$TMPD/required"

rm -rf "$TMPD"

if [ "$missing" -eq 0 ] && [ "$disordered" -eq 0 ]; then
  printf '  ok       %s: all %s required sections present, in template order\n' "$ARTIFACT" "$total"
  exit 0
fi
printf '  FAIL     %s: %s missing, %s out of order (of %s required)\n' "$ARTIFACT" "$missing" "$disordered" "$total"
exit 1
