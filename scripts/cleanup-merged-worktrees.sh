#!/usr/bin/env bash
# Merged-worktree cleanup (L1-9, 2026-10-20). Report-only by default.
#
#   bash scripts/cleanup-merged-worktrees.sh            # list candidates + why others are kept
#   bash scripts/cleanup-merged-worktrees.sh --apply    # remove safe candidates, then `git worktree prune`
#   options: --repo DIR  --base REF (default origin/master)  --min-idle-hours N (default 48)
#            --lock FILE (deploy lock, default /tmp/blockid-deploy.lock)
#
# A merged branch alone does not prove a worktree is idle (G30). A worktree is
# removed ONLY when every guard holds:
#   * not the main worktree, not detached, not locked (running Claude agents
#     lock theirs: "locked claude agent …");
#   * its branch has >= 1 commit of its own (branch reflog has an entry other
#     than "branch: Created from …"). A zero-commit agent branch is trivially
#     "merged" but usually means an agent is still starting — never touched;
#   * branch tip is an ancestor of --base (merged);
#   * clean: no modified or untracked files (ignored files only);
#   * idle: index/HEAD/reflog untouched for --min-idle-hours;
#   * no process has its cwd inside the worktree;
#   * --apply only: the deploy lock is free (a deploy may run from a worktree).
# Removal is `git worktree remove` WITHOUT --force; branches and history are
# never deleted. Exit 0 unless the arguments are invalid.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="origin/master"; MIN_IDLE_HOURS=48; APPLY=0; LOCK=/tmp/blockid-deploy.lock
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --min-idle-hours) MIN_IDLE_HOURS="$2"; shift 2 ;;
    --lock) LOCK="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$MIN_IDLE_HOURS" in ''|*[!0-9]*) echo "--min-idle-hours must be an integer" >&2; exit 2 ;; esac
git -C "$REPO" rev-parse --verify -q "$BASE^{commit}" >/dev/null || { echo "base $BASE not found" >&2; exit 2; }
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') worktree cleanup (apply=$APPLY base=$BASE idle>=${MIN_IDLE_HOURS}h)"

if [ "$APPLY" = 1 ]; then
  exec 9>>"$LOCK"
  if ! flock -n 9; then echo "deploy lock held — no removal this run"; APPLY=0; fi
  exec 9>&-
fi

# cwd of every process we can read (own user); unreadable ones are skipped.
CWDS=$(for p in /proc/[0-9]*; do readlink "$p/cwd" 2>/dev/null; done | sort -u)
NOW=$(date +%s); MIN_IDLE_S=$((MIN_IDLE_HOURS * 3600))
removed=0; kept=0; candidates=0

check() {  # $1 path, $2 branch ref, $3 locked(0/1) → prints reason or "ok"
  local wt="$1" ref="$2" locked="$3" gitdir newest f m
  [ "$locked" = 1 ] && { echo "locked"; return; }
  [ -n "$ref" ] || { echo "detached"; return; }
  [ -d "$wt" ] || { echo "missing (prune)"; return; }
  # Capture first and grep here-strings: `cmd | grep -q` under pipefail fails
  # on the writer's SIGPIPE, which would silently flip a guard.
  local reflog; reflog=$(git -C "$REPO" reflog show --format=%gs "$ref" -- 2>/dev/null || true)
  if ! grep -qv -e '^branch: Created from' -e '^$' <<<"$reflog"; then
    echo "zero own commits (agent may be running)"; return
  fi
  git -C "$REPO" merge-base --is-ancestor "$ref" "$BASE" 2>/dev/null || { echo "not merged into $BASE"; return; }
  # Idle is measured BEFORE `status`, and status never refreshes the index
  # (--no-optional-locks): a report run must not make worktrees look active.
  gitdir=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null) || { echo "unreadable git dir"; return; }
  newest=0
  for f in "$gitdir/index" "$gitdir/HEAD" "$gitdir/logs/HEAD"; do
    [ -e "$f" ] || continue
    m=$(stat -c %Y "$f"); [ "$m" -gt "$newest" ] && newest=$m
  done
  [ $((NOW - newest)) -ge "$MIN_IDLE_S" ] || { echo "active within ${MIN_IDLE_HOURS}h"; return; }
  [ -z "$(git --no-optional-locks -C "$wt" status --porcelain --untracked-files=all 2>/dev/null)" ] || { echo "dirty/untracked files"; return; }
  if grep -qxF -e "$wt" <<<"$CWDS" || grep -qF -e "$wt/" <<<"$CWDS"; then
    echo "process running inside"; return
  fi
  echo ok
}

main_wt=""; path=""; ref=""; locked=0
flush() {
  [ -n "$path" ] || return 0
  if [ -z "$main_wt" ]; then main_wt="$path"; path=""; return 0; fi
  local reason; reason=$(check "$path" "$ref" "$locked")
  if [ "$reason" != ok ]; then
    kept=$((kept + 1)); echo "KEEP    $path ($reason)"
  elif [ "$APPLY" = 1 ]; then
    if git -C "$REPO" worktree remove "$path" 2>/dev/null; then
      removed=$((removed + 1)); echo "REMOVED $path (${ref#refs/heads/} kept)"
    else
      kept=$((kept + 1)); echo "KEEP    $path (git worktree remove refused)"
    fi
  else
    candidates=$((candidates + 1)); echo "WOULD   $path (${ref#refs/heads/})"
  fi
  path=""; ref=""; locked=0
}
while IFS= read -r line; do
  case "$line" in
    "worktree "*) flush; path="${line#worktree }" ;;
    "branch "*) ref="${line#branch }" ;;
    locked|"locked "*) locked=1 ;;
  esac
done < <(git -C "$REPO" worktree list --porcelain; echo)
flush

if [ "$APPLY" = 1 ]; then
  git -C "$REPO" worktree prune -v 2>&1 | sed 's/^/prune: /'
fi
echo "summary: removed=$removed would_remove=$candidates kept=$kept"
exit 0
