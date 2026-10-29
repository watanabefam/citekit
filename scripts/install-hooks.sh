#!/usr/bin/env bash
# Install the repo's git hooks. There is no package.json here on purpose — CiteKit has no build step,
# so a copy into .git/hooks is the whole mechanism.
set -eu
root="$(git rev-parse --show-toplevel)"
install -m 755 "$root/scripts/pre-commit" "$root/.git/hooks/pre-commit"
echo "installed $root/.git/hooks/pre-commit"
