#!/usr/bin/env bash
# scripts/deploy-auto.sh — one-command production deploy (2026-09-25).
#
# Codifies the founder-approved G30/G33 procedure that was run by hand for
# every release on 2026-09-25:
#   1. wait until the 5-minute load average is below DEPLOY_MAX_LOAD
#      (default 3.0, at most DEPLOY_LOAD_WAIT_MIN minutes, default 30);
#   2. when 5 or more retained origins are live, retire the OLDEST origin that
#      is neither active nor previous and has zero tracked work (SIGTERM via
#      g30-origin-retire.py; release artifacts are kept) — founder standing
#      rule "retire oldest per deploy";
#   3. issue the pinned 2 h resource permit bound to HEAD and the current
#      retained set (g30-resource-admission.json, owner-only 0600);
#   4. run scripts/deploy-live.sh --quick (DEPLOY_ALLOW_DIRTY passes through);
#   5. after the 60 s operational soak, mark-good --review-deferred.
# Nothing here bypasses a gate: deploy-live.sh still runs every check and
# refuses on its own. Exit code = deploy-live.sh's (or 2 for preflight).
#
#   bash scripts/deploy-auto.sh            # deploy HEAD
#   DEPLOY_NO_RETIRE=1 bash scripts/deploy-auto.sh   # never retire; fail if at cap
set -uo pipefail
WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"
LOCK=/tmp/blockid-deploy.lock
RUNTIME="$HOME/.local/state/blockid-runtime"
export PYTHONDONTWRITEBYTECODE=1
say() { printf '[deploy-auto] %s\n' "$*"; }

if ps -eo args | grep -q "[d]eploy-live.sh"; then say "another deploy is running — aborting"; exit 2; fi

# 1 — load
max_load="${DEPLOY_MAX_LOAD:-3.0}"; waited=0; limit=$(( ${DEPLOY_LOAD_WAIT_MIN:-30} * 60 ))
until awk -v m="$max_load" '{exit !($2 < m)}' /proc/loadavg; do
  [ "$waited" -ge "$limit" ] && { say "load still $(cut -d' ' -f2 /proc/loadavg) ≥ $max_load after ${limit}s — aborting"; exit 2; }
  sleep 20; waited=$((waited + 20))
done
say "load ok ($(cut -d' ' -f1-3 /proc/loadavg))"

# 2 + 3 — capacity and permit, under the deployment lock
PREP=$( ( exec 200>"$LOCK"; flock -x -w 120 200 || { echo '{"error":"lock"}'; exit 1; }
python3 - "$WEB_DIR" "$RUNTIME" "${DEPLOY_NO_RETIRE:-0}" <<'PY'
import glob, hashlib, importlib.util, json, os, subprocess, sys, time
web, runtime, no_retire = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
spec = importlib.util.spec_from_file_location("ss", os.path.join(web, "scripts/g30-serving-state.py"))
ss = importlib.util.module_from_spec(spec); spec.loader.exec_module(ss)
state_path = os.path.join(web, "content/reports/g30-serving-state.json")
out = {}
def load(): return json.load(open(state_path))
s = load()
if s.get("phase") != "stable":
    print(json.dumps({"error": f"serving state phase {s.get('phase')}"})); sys.exit(1)
live = ss.retained_capacity(s)
out["live_before"] = live
if live >= 5:
    if no_retire:
        print(json.dumps({"error": f"{live} live origins and DEPLOY_NO_RETIRE=1"})); sys.exit(1)
    protected = {s["active"]["port"], (s.get("previous") or {}).get("port")}
    def alive(e):
        try: os.stat(f"/proc/{e['pid']}")
        except FileNotFoundError: return False
        return not ss._pid_proven_reused(e)
    candidates = sorted((e for e in s["retained"] if e["port"] not in protected and e["port"] not in s["quarantined"] and alive(e)), key=lambda e: e["port"])
    retired = None
    for e in candidates:
        units = sorted(glob.glob(os.path.join(runtime, f"g30-origin-{e['port']}-*.service.json")), key=os.path.getmtime)
        if not units: continue
        unit = os.path.basename(units[-1])[:-len(".json")]
        retire = [sys.executable, os.path.join(web, "scripts/g30-origin-retire.py"), "--web", web, "--port", str(e["port"]), "--unit", unit, "--lock-fd", "200"]
        plan = subprocess.run(retire, capture_output=True, text=True, pass_fds=(200,))
        try: p = json.loads(plan.stdout)
        except ValueError: continue
        if p.get("trackedActivities") != 0 or p.get("unresolvedJobs") != 0 or not p.get("expect"): continue
        applied = subprocess.run(retire + ["--expect", p["expect"], "--acknowledge-untracked-work", "--apply",
                                 "--reason", "deploy-auto: free one capacity slot (founder standing rule: retire oldest)"],
                                 capture_output=True, text=True, pass_fds=(200,))
        try: status = json.loads(applied.stdout).get("status")
        except ValueError: status = None
        if status == "stopped":
            retired = e["port"]; break
    out["retired"] = retired
    s = load()
    if ss.retained_capacity(s) >= 6:
        print(json.dumps({**out, "error": "no retirable origin; capacity full"})); sys.exit(1)
dig = hashlib.sha256(json.dumps({"active": s["active"], "retained": s["retained"], "quarantined": sorted(s["quarantined"])}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=web, text=True).strip()
now = int(time.time())
permit = os.path.join(runtime, "g30-resource-admission.json")
fd = os.open(permit + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, json.dumps({"version": 1, "enabled": True, "max_live_origins": 6, "issued_at": now, "expires_at": now + 7200, "candidate_sha": sha, "retained_digest": dig}).encode())
os.close(fd); os.chmod(permit + ".tmp", 0o600); os.replace(permit + ".tmp", permit)
out.update({"permit_sha": sha[:9], "live_after": ss.retained_capacity(s), "active": s["active"]["port"]})
print(json.dumps(out))
PY
) )
rc=$?; rm -rf scripts/__pycache__
say "prepare: $PREP"
[ $rc -eq 0 ] || { say "preflight refused"; exit 2; }

# 4 — deploy. Runtime-written paths (content/, .deploy-manifest.json) are
# always dirty on the server; any OTHER uncommitted change refuses the run.
OTHER_DIRTY=$(git status --porcelain | awk '{print $2}' | grep -vE '^"?(web/)?content/|^(web/)?\.deploy-manifest\.json$' || true)
if [ -n "$OTHER_DIRTY" ]; then say "uncommitted source changes — commit or stash first:"; echo "$OTHER_DIRTY" | head -10; exit 2; fi
export DEPLOY_ALLOW_DIRTY=1
LOGF="/tmp/blockid-deploy-auto-$(date -u +%Y%m%dT%H%M%S).log"
say "deploying $(git rev-parse --short HEAD) — log $LOGF"
bash scripts/deploy-live.sh --quick > "$LOGF" 2>&1
drc=$?; rm -rf scripts/__pycache__
grep -E "Production verified|DEPLOY GATES|GATE FAILED|refused|Unit:" "$LOGF" | head -6
[ $drc -eq 0 ] && grep -q "DEPLOY GATES COMPLETE" "$LOGF" || { say "deploy failed (exit $drc) — see $LOGF"; exit "${drc:-1}"; }

# 5 — mark-good after the soak
for _ in $(seq 1 20); do
  out=$( ( exec 200>"$LOCK"; flock -x -w 120 200 || exit 1; python3 scripts/g30-serving-state.py --web "$WEB_DIR" --mark-good --lock-fd 200 --review-deferred 2>&1 | tail -1; exit "${PIPESTATUS[0]}" ) ); mrc=$?
  if [ $mrc -eq 0 ]; then say "mark-good ok"; break; fi
  echo "$out" | grep -q "60 seconds" || { say "mark-good refused: $out"; break; }
  sleep 20
done
rm -rf scripts/__pycache__
say "live: $(curl -s -m 10 https://blockid.au/api/status | grep -o '"git_sha":"[a-f0-9]*"')"
