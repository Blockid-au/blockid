---
name: g36-stability
description: G36 stability auto-fix loop for blockid.au, hr.blockid.au and eth.blockid.au — collect live signals, triage, spawn worktree fix agents, merge, test, deploy serially, qa:live, report. Use when the user says "g36", "stability tick", "auto fix", "check lỗi", "tiếp tục G36", or asks for a stability report.
arguments: [mode]
---

# G36 — Stability auto-fix loop (one tick)

`$0` = `tick` (default: full tick), `report` (signals + report only, no code), `deploy` (merge ready branches + deploy only).

Hard rules (founder memory — never break):
- Main checkout `/home/dovanlong/blockid.au` is `git reset --hard` by a background loop → commit + push edits immediately; agents work in **worktrees** (`isolation: "worktree"`).
- Deploy ONLY with `bash web/scripts/deploy-auto.sh` (never Docker / CI). One deploy at a time: if another session is deploying or running qa:live (`pgrep -af "deploy-live|deploy-auto|qa-live"`), wait until it is fully done.
- After every deploy: review → test (`npm run qa:live` or affected specs) → fix before the next phase.
- No price changes, no customer e-mails (email paused), no Stripe dashboard changes or live charges, no prod DB writes without founder. Founder-only items go into the report.
- Max 4 fix agents per tick; never remove worktrees with zero commits (running agents).

## 1. Collect signals (read-only)
1. `curl -s https://blockid.au/api/status` — services, errors_1h, webhook_failed_24h, report_orders_pending, ai providers, tbr_quality, backups.
2. `tail -20 web/content/reports/error-digest.jsonl`; grep the newest `~/.local/state/blockid-runtime/*.service.log` for `error|failed|invariant|unhandled|500` and group counts (strip ids).
3. `web/content/reports/live-qa-latest.json` (+ `-partial`) → `findings`.
4. hr.blockid.au / eth.blockid.au: HTTP status, bundle hash, linked assets/APIs reachable (source: GitHub `Blockid-au/eth-blockid` / `monad-blockid`, clone in `/home/dovanlong/passport-review/`).
5. **Report price policy:** days left on `REPORT_PRICE_POLICY_EXPIRES_AT` (`web/src/lib/ai/report-attempt-budget.ts`). At ≤ 7 days ask the founder to approve `web/content/reports/ai-price-policy-renewal.json` — when it lapsed on 22/11 every report AI call was refused (0-word reports) for 3 days.
6. Satellite sites: `tail /data/logs/blockid-satellite-uptime.log` (cron every 2 min, alerts after 3 fails, auto-starts the eth VM).
7. Compare with the previous tick in `docs/reviews/g36-stability-report.md`; only NEW or still-open issues count.

## 2. Triage
Severity: **P0** login/payment/data loss/site down · **P1** AI report/agent failure, wrong price, failing qa:live · **P2** noisy logs, degraded provider, UX dead end. Skip noise (bot probes) unless it hides real errors.

## 3. Fix
For each P0–P2 cluster spawn one worktree agent (Agent tool, `isolation: "worktree"`, background) with: evidence, scope, "fix with vitest tests, run typecheck, commit on branch, do not deploy", report format (findings table + SHA + tests). Useful skills: debugging-wizard, stripe-saas-billing, nextjs-16-expert, supabase-postgres, typescript-pro, blockchain-expert.

## 4. Merge → test → deploy → verify
1. Merge agent branches into master in the main checkout (resolve conflicts), `cd web && npx vitest run` (full), `npm run typecheck`, commit + push.
2. `bash web/scripts/deploy-auto.sh` → confirm `/api/status` git_sha = HEAD.
3. `npm run qa:live` (or `-- <spec>` for touched areas) → any failure → fix before next deploy.
4. Post-ship review of the merged diff (`/code-review` medium) → fix P0/P1 found.

## 5. Report
Update `docs/reviews/g36-stability-report.md` (tick log: time, signals, issues opened/fixed with SHA, deploy SHA, qa:live result, founder-only items), add a one-line SOT §17 entry for each deploy, commit + push, republish the G36 report artifact, and send a short PushNotification summary.
