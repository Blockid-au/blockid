#!/bin/bash
# Remove agent worktrees whose branch has commits that are ALL merged into master.
# A branch still sitting at master (no commits yet) belongs to a RUNNING agent —
# never remove it (2026-09-11 incident: an in-flight worktree was deleted).
set -e
cd "$(git rev-parse --show-toplevel)"
# Two "running agent" signals, either one keeps the worktree:
#   1. the harness locks a running agent's worktree (`git worktree lock`,
#      reason "claude agent …") — the 2026-09-13 near-miss: master had moved
#      on (a docs commit) so a fresh branch no longer equalled the tip, yet
#      the lock was the only thing that stopped the removal;
#   2. the branch still points at an ancestor of master with no commits of
#      its own (never moved since creation).
LOCKED=$(git worktree list --porcelain | awk '/^worktree /{w=$2} /^locked/{print w}')
for w in $(git worktree list --porcelain | grep "^worktree .*agent-" | cut -d' ' -f2); do
  b=$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
  if printf '%s\n' "$LOCKED" | grep -qx "$w"; then echo "KEEP (locked by a running agent): $b"; continue; fi
  [ "$(git rev-parse "$b")" = "$(git rev-parse master)" ] && { echo "KEEP (no commits yet, likely running): $b"; continue; }
  # No commits of its own AND not at the tip: a branch created before master moved.
  # Only a branch whose own commits are merged is removable — detect "own commits"
  # via the reflog: the branch was created at <base> and still points there.
  created=$(git reflog show --format=%H "$b" 2>/dev/null | tail -1)
  [ -n "$created" ] && [ "$created" = "$(git rev-parse "$b")" ] && { echo "KEEP (never moved since creation): $b"; continue; }
  if git merge-base --is-ancestor "$b" master; then
    git worktree remove --force "$w" && git branch -D "$b" >/dev/null && echo "removed $b"
  else
    echo "KEEP (unmerged): $b"
  fi
done
git worktree prune
