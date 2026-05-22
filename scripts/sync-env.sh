#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# sync-env.sh — Sync .env keys to GitLab CI Variables
#
# Usage:
#   ./scripts/sync-env.sh check    # Show diff between .env and GitLab CI
#   ./scripts/sync-env.sh sync     # Push missing vars to GitLab CI
#   ./scripts/sync-env.sh generate # Generate .env.deploy from GitLab CI vars
#
# This script ensures .env local, GitLab CI Variables, and docker run
# are always in sync. Run after adding any new env var.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

GITLAB_URL="${GITLAB_URL:-https://git.longcare.au}"
PROJECT_ID="${GITLAB_PROJECT_ID:-4}"
ENV_FILE="${ENV_FILE:-web/.env}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-web/.env.deploy}"

# Sensitive keys that should be masked in GitLab
SENSITIVE_PATTERNS="KEY|SECRET|PASS|ROLE|SALT|TOKEN"

# Keys that are set by CI/CD itself (not from .env)
SKIP_KEYS="NODE_ENV|PORT|HOSTNAME|CI_|DEPLOY_|CI_ENV"

# ── Helpers ──────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

check_token() {
  if [ -z "${GITLAB_TOKEN:-}" ]; then
    # Try to read from git remote URL
    GITLAB_TOKEN=$(git remote get-url origin 2>/dev/null | grep -oP 'glpat-[^@]+' || true)
    if [ -z "$GITLAB_TOKEN" ]; then
      die "GITLAB_TOKEN not set. Export it or ensure git remote has token in URL."
    fi
  fi
}

get_gitlab_vars() {
  curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
    "$GITLAB_URL/api/v4/projects/$PROJECT_ID/variables?per_page=100" 2>/dev/null
}

get_local_keys() {
  grep -E "^[A-Z_]+=" "$ENV_FILE" 2>/dev/null | grep -v "^#" | while IFS='=' read -r key value; do
    [ -n "$value" ] && echo "$key"
  done | sort -u
}

# ── Commands ─────────────────────────────────────────────────────────

cmd_check() {
  check_token
  echo "=== Comparing $ENV_FILE vs GitLab CI Variables ==="
  echo ""

  local gitlab_keys=$(get_gitlab_vars | python3 -c "
import json, sys
data = json.load(sys.stdin)
for v in data:
    print(v['key'])
" 2>/dev/null | sort)

  local local_keys=$(get_local_keys)
  local missing_in_gitlab=0
  local missing_in_env=0

  echo "── Missing from GitLab CI (in .env but not in GitLab) ──"
  for k in $local_keys; do
    if ! echo "$gitlab_keys" | grep -qx "$k"; then
      echo "  ❌ $k"
      missing_in_gitlab=$((missing_in_gitlab + 1))
    fi
  done
  [ "$missing_in_gitlab" -eq 0 ] && echo "  ✅ All .env keys exist in GitLab CI"

  echo ""
  echo "── Missing from .env (in GitLab but not in .env) ──"
  for k in $gitlab_keys; do
    echo "$k" | grep -qE "^($SKIP_KEYS)" && continue
    if ! echo "$local_keys" | grep -qx "$k"; then
      echo "  ⚠️  $k (in GitLab only)"
      missing_in_env=$((missing_in_env + 1))
    fi
  done
  [ "$missing_in_env" -eq 0 ] && echo "  ✅ All GitLab keys exist in .env"

  echo ""
  echo "Summary: .env=$( echo "$local_keys" | wc -l) keys, GitLab=$(echo "$gitlab_keys" | wc -l) keys"
  echo "  Missing from GitLab: $missing_in_gitlab"
  echo "  Missing from .env: $missing_in_env"

  return $missing_in_gitlab
}

cmd_sync() {
  check_token
  echo "=== Syncing $ENV_FILE → GitLab CI Variables ==="

  local gitlab_keys=$(get_gitlab_vars | python3 -c "
import json, sys
for v in json.load(sys.stdin):
    print(v['key'])
" 2>/dev/null)

  local added=0

  grep -E "^[A-Z_]+=" "$ENV_FILE" 2>/dev/null | grep -v "^#" | while IFS='=' read -r key value; do
    [ -z "$value" ] && continue

    if echo "$gitlab_keys" | grep -qx "$key"; then
      continue  # Already exists
    fi

    # Determine if should be masked
    local masked="false"
    echo "$key" | grep -qE "$SENSITIVE_PATTERNS" && masked="true"

    echo -n "  Adding $key... "
    local result=$(curl -s --request POST \
      --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
      --header "Content-Type: application/json" \
      --data "{\"key\": \"$key\", \"value\": $(python3 -c "import json; print(json.dumps('$value'))" 2>/dev/null || echo "\"$value\""), \"protected\": false, \"masked\": $masked}" \
      "$GITLAB_URL/api/v4/projects/$PROJECT_ID/variables" 2>/dev/null)

    if echo "$result" | grep -q '"key"'; then
      echo "✅"
      added=$((added + 1))
    else
      echo "❌ $(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('message','unknown error'))" 2>/dev/null)"
    fi
  done

  echo ""
  echo "Done. Added: $added new variables."
}

cmd_generate() {
  echo "=== Generating $DEPLOY_ENV_FILE from .env ==="

  # Generate env file for docker --env-file
  # This reads .env and outputs KEY=VALUE pairs (no quotes, no comments)
  > "$DEPLOY_ENV_FILE"

  # Add fixed values
  echo "NODE_ENV=production" >> "$DEPLOY_ENV_FILE"
  echo "PORT=3000" >> "$DEPLOY_ENV_FILE"
  echo "HOSTNAME=0.0.0.0" >> "$DEPLOY_ENV_FILE"

  # Add all non-empty vars from .env
  grep -E "^[A-Z_]+=" "$ENV_FILE" 2>/dev/null | grep -v "^#" | while IFS='=' read -r key value; do
    [ -z "$value" ] && continue
    echo "$key=$value" >> "$DEPLOY_ENV_FILE"
  done

  local count=$(wc -l < "$DEPLOY_ENV_FILE")
  echo "Generated $DEPLOY_ENV_FILE with $count variables"
  echo ""
  echo "Use: docker run --env-file $DEPLOY_ENV_FILE ..."
}

# ── Main ─────────────────────────────────────────────────────────────

case "${1:-check}" in
  check)    cmd_check ;;
  sync)     cmd_sync ;;
  generate) cmd_generate ;;
  *)        echo "Usage: $0 {check|sync|generate}" ;;
esac
