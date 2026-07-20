# Secrets Audit — 2026-07-20

**Owner:** CISO agent  ·  **Script:** `web/scripts/audit-secrets.mjs`

- Files scanned: 1141
- Patterns applied: 13
- Findings: **0**

## Scan scope

- `web/src/`
- `web/scripts/`
- `web/supabase/migrations/`

Skipped directory names: `node_modules`, `.next`, `.git`, `content`, `docs`, `dist`, `build`, `.turbo`, `.cache`, `coverage`

## Patterns

- `stripe-live`
- `stripe-test`
- `slack-bot`
- `slack-user`
- `aws-access-key`
- `pem-block`
- `google-api-key`
- `slack-token-var`
- `openai-key-var`
- `openai-key-raw`
- `github-pat-classic`
- `github-pat-fine`
- `env-hex-token-40+`

## Results

No secrets detected.

---
_Full secret values are never included. Review each finding — a hit is signal, not proof — and rotate any live credential immediately._
