#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/../../.." && pwd)
name="blockid-authority-test-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Isolated ephemeral database: no host ports, no production mount, no network.
docker run -d --name "$name" --network none --tmpfs /tmp --user postgres \
  -v "$repo/web/supabase/migrations/0447_reanalysis_authority.sql:/migration.sql:ro" \
  -v "$repo/scripts/db/tests/reanalysis-authority.sql:/test.sql:ro" \
  --entrypoint bash supabase/postgres:15.8.1.085 -c 'initdb -D /tmp/authority-pg -A trust -U postgres >/dev/null && exec postgres -D /tmp/authority-pg -k /tmp' >/dev/null
for i in $(seq 1 30); do
  if docker exec "$name" pg_isready -h /tmp -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$name" psql -h /tmp -U postgres -d postgres -f /test.sql
