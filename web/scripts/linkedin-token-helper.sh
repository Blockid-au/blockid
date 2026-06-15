#!/usr/bin/env bash
# LinkedIn page access-token helper — manual OAuth 2.0 (authorization-code) flow
# for the Startup Value Index page (LINKEDIN_PAGE_ID=129624133).
#
# Why this script: LinkedIn's "Generate token" button on Developer Portal works
# but the resulting token expires in 60 days. This script does the same OAuth
# dance + writes the result straight into web/.env so the next cron fire picks
# it up. Run again every 50 days to refresh.
#
# Usage:
#   bash scripts/linkedin-token-helper.sh
#
# Steps the script walks you through:
#   1. Prints the authorize URL → open in browser (logged in as SVI page admin)
#   2. LinkedIn redirects to http://localhost:8000/?code=... — copy the `code`
#   3. Paste code → script exchanges for access_token + refresh_token
#   4. Script writes LINKEDIN_PAGE_ACCESS_TOKEN to web/.env
#
# Prereqs in web/.env:
#   LINKEDIN_CLIENT_ID
#   LINKEDIN_CLIENT_SECRET
#   LINKEDIN_PAGE_ID

set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$WEB_DIR/.env"

env_val() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

CLIENT_ID="$(env_val LINKEDIN_CLIENT_ID)"
CLIENT_SECRET="$(env_val LINKEDIN_CLIENT_SECRET)"
PAGE_ID="$(env_val LINKEDIN_PAGE_ID)"

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET in web/.env."
  echo "   Create them at https://www.linkedin.com/developers/apps/ first."
  exit 1
fi

# Required scopes (Community Management API):
#   w_organization_social  — post on behalf of the page
#   r_organization_social  — read post metrics
#   rw_organization_admin  — admin-level read of the org (followers, page info)
SCOPE="w_organization_social,r_organization_social,rw_organization_admin"

# LinkedIn requires the redirect URI to be in the app's "Authorized redirect URLs"
# list. http://localhost:8000 is the simplest — add it via:
#   App → Auth tab → OAuth 2.0 settings → Authorized redirect URLs
REDIRECT_URI="http://localhost:8000/"
STATE="svi-$(date +%s)"

AUTH_URL="https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$REDIRECT_URI', safe=''))")&state=${STATE}&scope=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$SCOPE', safe=''))")"

cat <<EOF
╔════════════════════════════════════════════════════════════════════╗
║  LinkedIn — Startup Value Index page access-token helper           ║
╠════════════════════════════════════════════════════════════════════╣
║  Page ID:       ${PAGE_ID}
║  Page URL:      https://www.linkedin.com/company/${PAGE_ID}/
║  Scopes:        ${SCOPE}
║  Redirect URI:  ${REDIRECT_URI}
╚════════════════════════════════════════════════════════════════════╝

STEP 1 — In your LinkedIn Developer Console (https://www.linkedin.com/developers/apps/):
  • Open your app → "Auth" tab
  • Authorized redirect URLs → add: ${REDIRECT_URI}
  • Click "Update" to save.

STEP 2 — Open this URL in a browser logged in as an ADMIN of the SVI page:

${AUTH_URL}

  • Click "Allow" on the LinkedIn consent screen.
  • LinkedIn redirects to ${REDIRECT_URI}?code=<LONG_CODE>&state=${STATE}
  • Your browser will show "site can't be reached" — that's expected.
  • Copy the ENTIRE value of the "code" query parameter from the URL bar.

EOF

read -r -p "STEP 3 — Paste the code value here: " CODE
CODE="$(echo "$CODE" | tr -d ' \t\n\r')"

if [ -z "$CODE" ]; then
  echo "❌ No code provided. Aborting."
  exit 1
fi

echo
echo "STEP 4 — Exchanging code for access_token…"

RESPONSE="$(curl -sS -X POST "https://www.linkedin.com/oauth/v2/accessToken" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=${CODE}" \
  --data-urlencode "redirect_uri=${REDIRECT_URI}" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}")"

ACCESS_TOKEN="$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null || true)"
EXPIRES="$(echo "$RESPONSE" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('expires_in',''))" 2>/dev/null || true)"

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Token exchange failed. LinkedIn response:"
  echo "$RESPONSE"
  exit 1
fi

echo "✓ Got access token (expires in ${EXPIRES}s ≈ $((EXPIRES / 86400)) days)"
echo

# Backup .env before mutating
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%s)"

if grep -q "^LINKEDIN_PAGE_ACCESS_TOKEN=" "$ENV_FILE"; then
  # Portable sed in-place: use temp file
  awk -v t="LINKEDIN_PAGE_ACCESS_TOKEN=${ACCESS_TOKEN}" '
    /^LINKEDIN_PAGE_ACCESS_TOKEN=/ { print t; next }
    { print }
  ' "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
else
  printf "\nLINKEDIN_PAGE_ACCESS_TOKEN=%s\n" "$ACCESS_TOKEN" >> "$ENV_FILE"
fi

chmod 600 "$ENV_FILE"
echo "✓ LINKEDIN_PAGE_ACCESS_TOKEN written to web/.env"
echo "✓ Backup of previous .env at ${ENV_FILE}.bak.*"
echo
echo "STEP 5 — Smoke test the page-post route:"
echo
echo "  CRON_SECRET=\$(grep '^CRON_SECRET=' web/.env | cut -d= -f2-)"
echo "  curl -sS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" \\"
echo "    http://127.0.0.1:4001/api/cron/linkedin-page-post | head -c 500"
echo
echo "If you see {\"ok\":true,\"postId\":\"…\"} the integration works."
echo
echo "🔄 Set a calendar reminder for $((EXPIRES / 86400 - 10)) days from now to re-run this script."
