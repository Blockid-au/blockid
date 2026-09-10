#!/usr/bin/env bash
# post-deploy-checks.sh — production smoke for things that were once wrong.
#
# Every assertion here is a regression that actually shipped, not a
# hypothetical. Run after a deploy:  bash scripts/qa/post-deploy-checks.sh
#
#   * /guide/reports served BlockID's own C-Level agent briefs — security
#     posture, open task IDs, server metrics and an internal secrets audit —
#     as public downloads. It must stay gone, and stay a 308 to /sample rather
#     than a 404, because the page was indexed.
#   * The CRON_SECRET guarding every /api/cron/* endpoint was committed in
#     plaintext to a public repo. The leaked value must keep returning 401.
#   * Four cron jobs spent months sending "Bearer " with no value, so an empty
#     bearer must 401 too — that is the shape the bug had.
#   * /solutions/advisor is a documented alias to /for/advisor, not a bug.
#
# Reads web/.env for the current CRON_SECRET; run it on the deploy host.
B=https://blockid.au
pass=0; fail=0
chk() { # chk <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1));
  else echo "  ✗ $1 — expected $2, got $3"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$1"; }
loc()  { curl -s -o /dev/null -w '%{redirect_url}' "$1"; }

echo "── internal-report surface removed ──"
# 308 permanent, not 404: the page was indexed, so it redirects to /sample.
chk "/guide/reports -> /sample (308)"    308 "$(code $B/guide/reports)"
chk "/guide/reports target"             "$B/sample" "$(loc $B/guide/reports)"
chk "ciso brief download gone"           404 "$(code $B/api/guide/reports/ciso-daily-2026-08-23.md)"
chk "secrets audit download gone"        404 "$(code $B/api/guide/reports/security-secrets-audit-2026-07-20.md)"
chk "/reports/samples -> /sample"        "$B/sample" "$(loc $B/reports/samples)"
chk "/reports/samples is 308"            308 "$(code $B/reports/samples)"
chk "/sample still live"                 200 "$(code $B/sample)"

echo "── CTAs that used to point at the gallery ──"
for p in /guide /guide/scn /features /tbr/demo /showcase/blockid; do
  chk "$p renders" 200 "$(code $B$p)"
done
echo -n "  dangling /guide/reports links on those pages: "
n=0; for p in /guide /guide/scn /features /tbr/demo /showcase/blockid /sample; do
  n=$((n + $(curl -s "$B$p" | grep -o 'href="/guide/reports"' | wc -l)))
done
if [ "$n" = "0" ]; then echo "0 ✓"; pass=$((pass+1)); else echo "$n ✗"; fail=$((fail+1)); fi

echo "── cron auth uses the rotated secret ──"
NEW=$(grep '^CRON_SECRET=' /home/dovanlong/blockid.au/web/.env | cut -d= -f2-)
# Rotation proof WITHOUT putting the leaked value in the repo. Committing the
# old secret as a literal — even a dead one — is the habit that caused this in
# the first place, and gitleaks (correctly) aborted a deploy over it. Compare
# a hash instead: if the live secret ever equals the leaked one again, this
# fails, and no credential is stored here either way.
LEAKED_SHA256='aec9cb53387ad753e686d25f1ec465bc969ee4a9f0e43e42ea52722df8ac8e51'
cur_sha=$(printf '%s' "$NEW" | sha256sum | cut -d' ' -f1)
if [ "$cur_sha" = "$LEAKED_SHA256" ]; then
  echo "  ✗ CRON_SECRET is back to the value leaked on the public repo"; fail=$((fail+1))
else
  echo "  ✓ CRON_SECRET is not the leaked value"; pass=$((pass+1))
fi
chk "a wrong secret is rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer not-the-real-secret-0000000000000000' $B/api/cron/ai-health-check)"
chk "empty bearer rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer ' $B/api/cron/ai-health-check)"
got=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $NEW" $B/api/cron/ai-health-check)
if [ "$got" = "200" ] || [ "$got" = "500" ]; then echo "  ✓ new secret authenticates ($got, not 401)"; pass=$((pass+1));
else echo "  ✗ new secret — got $got"; fail=$((fail+1)); fi

echo "── core revenue + marketing surfaces ──"
for p in / /pricing /analyze /solutions/founder /solutions/investor /solutions/accelerator /security-audit /insights /for/advisor; do
  chk "$p" 200 "$(code $B$p)"
done
chk "/analyze?tier=paid" 200 "$(code "$B/analyze?tier=paid")"

chk "/solutions/advisor alias -> /for/advisor" "$B/for/advisor" "$(loc $B/solutions/advisor)"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ]
