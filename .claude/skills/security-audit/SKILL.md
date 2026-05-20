---
name: security-audit
description: "Run a security audit — headers, CSP, auth, secrets, OWASP top 10. Use when user says 'security audit', 'check security', or 'vulnerability'."
---

# Security Audit — BlockID.au

## Steps

1. **HTTP Headers** — check HSTS, CSP, X-Content-Type, Referrer-Policy, Permissions-Policy
2. **Authentication** — verify session TTL, cookie flags (HttpOnly, Secure, SameSite)
3. **API Security** — test unauthenticated access to protected endpoints
4. **Secrets** — scan for exposed API keys in client-side code or git history
5. **CORS** — verify Access-Control headers on /api/* endpoints
6. **Input Validation** — check for SQL injection, XSS in user inputs
7. **Rate Limiting** — check if endpoints are rate-limited
8. **Dependencies** — run `npm audit` for known vulnerabilities
9. **Stripe Webhook** — verify signature validation on webhook endpoint

**Output:** Security report with severity levels (Critical/High/Medium/Low).