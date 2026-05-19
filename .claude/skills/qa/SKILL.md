---
name: qa
description: Full QA audit of BlockID — smoke test all pages, test auth flows, test API endpoints with edge cases, run unit tests. Use when the user says "QA", "full test", or "audit".
---

# Full QA Audit — BlockID.au

Run a comprehensive quality assurance audit of the BlockID.au application.

## Execution Strategy

Spawn 4 parallel agents for maximum speed:

### Agent 1: Smoke Test All Pages
Test every page returns expected HTTP status:
- Public pages (/, /score, /about, /privacy, /terms, /contact, /investors, /founding-50, /auth/login)
- Tool pages (/tools/dilution, /tools/cap-table, /tools/data-room, /tools/equity-split, /tools/funding-plan, /tools/idea-valuation, /tools/term-sheet, /tools/cofounder-match)
- Protected pages should redirect 307 (/dashboard, /workspace/*, /admin/*)
- Check content: company name, ABN, ACN in footer

### Agent 2: Auth Flow Testing
- Create test user + session in Supabase DB via `docker exec supabase-db psql`
- Test authenticated access to dashboard, workspace, admin
- Test Stripe checkout returns Stripe URL with auth
- Test expired/fake sessions rejected
- Test logout clears cookie + DB
- Clean up test data after

### Agent 3: API Endpoint Testing
Test ALL API routes with valid, invalid, and edge-case payloads:
- Score API: valid data, empty inputs, negative numbers, SQL injection
- Lead API: valid, empty email, XSS payload
- Coupon API: valid code, nonexistent, empty
- Stripe APIs: auth checks, invalid plans, fake signatures
- SVI APIs: all should require auth (401)
- Cron APIs: should require CRON_SECRET

### Agent 4: Unit Tests + Build
- Run `npm run test` (vitest)
- Run `npx tsc --noEmit`
- Run `npm run lint`
- Report pass/fail counts

## Report Format

Compile results into a summary table:
- Total tests, pass count, fail count
- CRITICAL / WARNING / INFO findings
- Specific file:line references for any issues