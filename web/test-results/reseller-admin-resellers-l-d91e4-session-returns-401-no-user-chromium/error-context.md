# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reseller/admin-resellers-list-authz.spec.ts >> Admin resellers list pre-read authorization — P10 dry-run >> unauthenticated — GET with no session returns 401 no_user
- Location: tests/e2e/reseller/admin-resellers-list-authz.spec.ts:352:7

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:3000
Call log:
  - → GET http://localhost:3000/api/admin/resellers
    - user-agent: Playwright/1.61.1 (x64; debian 13) node/22.22
    - accept: */*
    - accept-encoding: gzip,deflate,br

```