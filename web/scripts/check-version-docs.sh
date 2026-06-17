#!/bin/bash
# Pre-commit hook helper — reminds the committer to update docs when a new
# version is shipped. Hooked from .git/hooks/pre-commit:
#
#   bash web/scripts/check-version-docs.sh || exit 1
#
# Triggers when the commit message contains a version tag like "(v2.7)" or
# "vMAJOR.MINOR" outside the existing docs. Does NOT block — just prints a
# big yellow warning to remind the human / agent to update:
#   - docs/ROADMAP.md
#   - docs/ARCHITECTURE.md
#   - docs/TEAM_STRUCTURE.md
#   - docs/VERSION.md

set -u

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Look at the staged commit message (passed as $1 to commit-msg hook) OR
# at the staged code changes to infer if a version bump is happening.
# Heuristic: if any of the following SVI-engine files are modified, we're
# probably bumping a minor version.
TRIGGER_FILES=(
  "web/src/lib/svi-analysis.ts"
  "web/src/lib/agents/deep-valuation.ts"
  "web/src/lib/agents/scn-action-plan.ts"
  "web/src/lib/agents/maturity-detector.ts"
  "web/src/lib/agents/cohort-percentile.ts"
  "web/src/lib/project-name-extractor.ts"
)

DOC_FILES=(
  "docs/ROADMAP.md"
  "docs/ARCHITECTURE.md"
  "docs/TEAM_STRUCTURE.md"
  "docs/VERSION.md"
)

STAGED=$(git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED" ] && exit 0

trigger_hit=false
for f in "${TRIGGER_FILES[@]}"; do
  if echo "$STAGED" | grep -qE "^${f}\$"; then
    trigger_hit=true
    break
  fi
done

# Also trigger if commit message mentions "v2." or a Tnnn task that ships a
# new minor version (only checked when running as commit-msg hook with $1).
if [ "$#" -ge 1 ] && [ -f "$1" ]; then
  if grep -qE "v2\.[0-9]+|T0[0-9]{3}" "$1"; then
    trigger_hit=true
  fi
fi

$trigger_hit || exit 0

# Check whether the doc files are also staged
docs_staged=false
for d in "${DOC_FILES[@]}"; do
  if echo "$STAGED" | grep -qE "^${d}\$"; then
    docs_staged=true
    break
  fi
done

$docs_staged && exit 0

# Print warning (non-blocking)
printf "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${YELLOW}⚠  VERSION-DOC REMINDER${NC}\n"
printf "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "This commit touches the SVI engine but does NOT update the docs:\n"
for d in "${DOC_FILES[@]}"; do
  printf "  ${YELLOW}•${NC} ${d}\n"
done
printf "\nIf you're shipping a new version, update them as part of THIS commit so\n"
printf "future agents can read accurate state. Add and re-commit, or proceed if\n"
printf "this is just a fix.\n"
printf "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Non-blocking — the agent is expected to read this and act on it. Returning
# 0 lets the commit through. Set CHECK_VERSION_DOCS_STRICT=1 to block instead.
[ "${CHECK_VERSION_DOCS_STRICT:-0}" = "1" ] && exit 1
exit 0
