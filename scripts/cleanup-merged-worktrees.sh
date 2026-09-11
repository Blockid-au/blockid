#!/bin/bash
# Remove agent worktrees whose branch has commits that are ALL merged into master.
# A branch still sitting at master (no commits yet) belongs to a RUNNING agent —
# never remove it (2026-09-11 incident: an in-flight worktree was deleted).
set -e
cd "$(git rev-parse --show-toplevel)"
for w in $(git worktree list --porcelain | grep "^worktree .*agent-" | cut -d' ' -f2); do
  b=$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
  [ "$(git rev-parse "$b")" = "$(git rev-parse master)" ] && { echo "KEEP (no commits yet, likely running): $b"; continue; }
  if git merge-base --is-ancestor "$b" master; then
    git worktree remove --force "$w" && git branch -D "$b" >/dev/null && echo "removed $b"
  else
    echo "KEEP (unmerged): $b"
  fi
done
git worktree prune
