# Orchestrator — Goal 5A/5B/5C/5D Tracking

**Owner:** Chief of Staff (orchestrator agent-manager)
**Status:** Live tracking document — updated weekly
**Baseline:** v2.0.0-beta.7 (git sha `1e747b4`)
**Companion docs:**
- `docs/goal-5a-autonomous-quality-gate.md`
- `docs/goal-5b-investor-pack-v2.md`
- `docs/goal-5c-au-startup-public-index.md`
- `docs/goal-5d-vi-founder-cohort.md`
- `docs/IMPLEMENTATION-PLAN-v3.1-amended.md`

---

## 1. Purpose

Four goals run in parallel over an approximately 24-week window from Q4 2026 through Q2 2027. This document is the single source of truth for how the orchestrator tracks progress across them without collisions, spots cross-goal dependencies before they bite, and escalates when a goal is drifting off its target.

The pattern is deliberately conservative. Each goal owns a set of files, an owner-role, and a WSJF-scored task list. The orchestrator's job is not to write code — it is to spawn sub-agents on the right goal at the right moment, catch cross-goal collisions, and surface red flags to Chief of Staff.

---

## 2. Goal-ownership matrix

| Goal | Primary owner | Co-owners | Target quarter | Task range | Blocking status |
|------|---------------|-----------|----------------|-------------|-----------------|
| 5A — Autonomous Quality Gate | CTO | Chief of Staff | Q4 2026 | T-1101..T-1112 | independent |
| 5B — Investor Pack v2 | CPO | CTO + CFO | Q1 2027 | T-1201..T-1212 | v3 T-0715 must land first |
| 5C — AU Startup Public Index | CMO | CTO + CPO | Q1 2027 | T-1301..T-1315 | v3 T-0511, T-0906 must land |
| 5D — VI Founder Cohort | CMO | CPO + CTO | Q2 2027 | T-1401..T-1412 | v3 T-0514 must land; Week 6 blocked by 5C |

### 2.1 File domain ownership

To avoid two sub-agents editing the same file in the same day, each goal claims a domain:

| Domain | Owned by | Notes |
|--------|----------|-------|
| `web/scripts/nightly-clevel-review.mjs` (new) | 5A | Only 5A writes; nightly reviewers only READ |
| `web/scripts/nightly-review-*.{mjs,ts}` (new) | 5A | 5A exclusive |
| `web/content/reports/{cto,cfo,cdo,ciso,cro,cmo}-nightly-*.md` (new) | 5A (writer) | Everyone reads |
| `web/src/lib/pdf/investor-pack.tsx` (new) | 5B | 5B exclusive |
| `web/src/lib/pdf/investor-pack/**` (new) | 5B | 5B exclusive |
| `web/src/app/api/investor-pack/**` (new) | 5B | 5B exclusive |
| `web/src/app/pack/[shareId]/**` (new) | 5B | 5B exclusive |
| `web/src/app/index/**` (new) | 5C | 5C exclusive |
| `web/src/app/listings/[ticker]/**` (new) | 5C | 5C exclusive |
| `web/src/app/submit/**` (new) | 5C | 5C exclusive |
| `web/src/lib/index/**` (new) | 5C | 5C exclusive |
| `web/src/app/vi/**` (new) | 5D | 5D exclusive |
| `web/src/lib/i18n/**` (new) | 5D | 5D exclusive |
| `web/src/lib/zalo.ts` (new) | 5D | 5D exclusive |
| `web/src/content/i18n/vi/**` (new) | 5D | 5D exclusive |
| `web/supabase/migrations/**` | shared | migrations serialised (see §5) |
| `web/src/lib/analytics/events.registry.json` | shared | 3 goals write; use PR-lock (§5) |
| `web/src/lib/email.ts` | shared | 5D adds locale dispatch; 5B may add pack-share templates; use PR-lock |
| `web/scripts/crontab.production` | shared | 3 goals add crons; alphabetical section pins (§5) |
| `web/public/sitemap.ts` | shared | 5C + 5D both extend; use PR-lock |
| `web/src/components/workspace/platform-roadmap.tsx` | Chief of Staff | this doc + PRs update in one lockstep |

### 2.2 Owner briefing

Chief of Staff drops one-page owner briefings per goal into `docs/owner-briefs/`. Each brief covers: goal summary, task IDs, weekly cadence, red-flag triggers, escalation path.

The 4 briefs are created lazily — the first time an owner is spawned to work on a goal, the orchestrator writes the brief.

---

## 3. Cross-goal dependencies

### 3.1 Hard blockers

Dependencies that MUST resolve before the downstream goal can ship:

```
    Goal 5A (Quality Gate)
        │
        │ soft-dep (Goal 5B benefits from nightly review of PDF template)
        ▼
    Goal 5B (Investor Pack v2)
        │
        │ soft-dep (Goal 5C could embed pack-download CTA on listing pages, post-launch)
        ▼
    Goal 5C (AU Startup Public Index)
        │
        │ HARD BLOCKER (Week 6 of Goal 5D forks /vi/index and /vi/listings/[ticker])
        ▼
    Goal 5D (VI Founder Cohort)
```

**Hard blocker: Goal 5C ships `/index` + `/listings/[ticker]` before Goal 5D Week 6 forks `/vi/index` + `/vi/listings/[ticker]`.** Goal 5D Weeks 1-5 do NOT depend on 5C; only Week 6 forks.

### 3.2 Soft dependencies (recommended but not blocking)

- **Goal 5A → Goal 5B.** Auto-review of investor pack templates and PDF renderers benefits from nightly review coverage. If Goal 5A slips, Goal 5B still ships but without the safety net. Recommended order: start Goal 5A Week 1, Goal 5B Week 1 in parallel; Goal 5A must reach at least Week 2 (real sub-agents live) before Goal 5B Week 5 GA.
- **Goal 5A → Goal 5C.** Nightly review's CMO agent will catch SEO drift on `/index`; recommended live before Goal 5C Week 6.
- **Goal 5A → Goal 5D.** Nightly review's CMO agent will catch VI copy drift; recommended live before Goal 5D Week 4.
- **Goal 5B → Goal 5C.** Post-launch, the listing detail page can embed a "See how X built their pack" CTA that funnels to Goal 5B. Nice-to-have, not blocker.

### 3.3 Shared upstream dependencies (from v3.1 amendment)

All 4 goals depend on the following v3.1 tasks:

| Upstream task | Required by | Rationale |
|---------------|-------------|-----------|
| T-1003 (analytics registry unification) | 5A, 5B, 5C, 5D | All 4 goals wire new events |
| T-1009 (6 new analytics events) | 5B, 5C, 5D | Blocks measurement infra |
| T-1010 (BQ export pipeline) | 5A, 5B, 5C, 5D | Blocks measurement / cost tracking |
| T-1005 (retire NEXT_PUBLIC_UPGRADE_V2) | 5A | Simplifies CTO agent scope |
| T-1019 (publish-insight cron unstick) | 5C, 5D | Blocks SEO content pipeline |
| T-1016 (cron widespread-failure watchdog) | 5A | Complements nightly review's cron-health row |
| v3 T-0511 (SVI 13-criteria) | 5B, 5C | Blocks SVI page + comparable set |
| v3 T-0606 (cap table + waterfall) | 5B | Blocks cap-table page in pack |
| v3 T-0715 (`<InvestorPackBuilder>`) | 5B | Blocks pack v2 as escape-hatch preserve |
| v3 T-0514 (VI legal MDX) | 5D | Blocks VI onboarding disclaimers |
| T-1007 (v_mrr_active view) | 5B | Blocks financials page |

**Rule:** No Goal 5x task ships before its listed upstream task lands. Orchestrator sub-agent MUST verify with `git log --grep="T-1003"` etc. before spawning a downstream task.

### 3.4 Shared file overlaps and lock strategy

Files touched by ≥ 2 goals require serialisation. Strategy: only ONE sub-agent may hold a lock on a shared file at a time. The lock is a marker file `.lock-<filename>.md` in the same directory OR a git-branch-name convention.

Files needing serialisation:
- `web/src/lib/analytics/events.registry.json` — extended by T-1209 (5B), T-1314 (5C), T-1411 (5D). Sub-agent must add its keys to the JSON without removing others.
- `web/src/lib/email.ts` — extended by T-1405 (5D). Also extended by potential future 5B share-open notification. Sequential edit only.
- `web/scripts/crontab.production` — appended by T-1109 (5A), T-1311 (5C), T-1408 (5D). Each cron appends to its dedicated section (SYSTEM / QUALITY / GROWTH / VI).
- `web/public/sitemap.ts` — extended by T-1306 (5C) and Goal 5D VI sitemap extension.
- `web/src/components/workspace/platform-roadmap.tsx` — already touched in this drop; Chief of Staff owns future updates.

Migrations are serialised globally by number (0090..0094 are pre-allocated in the goal docs; no other goal may reuse those numbers).

---

## 4. Weekly review cadence

### 4.1 Every Monday 09:00 AEST — Chief of Staff review

Chief of Staff opens each goal doc + this tracking doc; updates a per-goal status entry:

```
| Goal | Week | Tasks shipped | Tasks in flight | Blockers | RAG |
|------|------|---------------|-----------------|----------|-----|
| 5A   | W2   | T-1101, T-1102, T-1103, T-1109 | T-1104, T-1107 | none | G |
| 5B   | W1   | T-1205 | T-1201, T-1202 | v3 T-0715 in review | A |
| 5C   | W1   | T-1301 | T-1302, T-1303 | none | G |
| 5D   | W0   | (Zalo OA registration started) | | Zalo OA lead time | A |
```

Status stored in `web/content/reports/goal-status.jsonl` (append-only weekly rows). One JSONL row per goal per week.

### 4.2 Every Wednesday 14:00 AEST — Owner sync

Each owner-role agent (CTO for 5A, CPO for 5B, CMO for 5C+5D) writes a one-paragraph status to `docs/owner-briefs/<goal>-week-<n>.md` covering:
- What shipped since Monday.
- What is blocked.
- What decisions the owner needs from Chief of Staff.

Orchestrator reads these Wednesday afternoon and updates the JSONL row for Thursday's exec review.

### 4.3 Every Friday 16:00 AEST — Exec review

Chief of Staff runs the risk matrix from §6 against the current JSONL rows. Any goal in AMBER for 2 consecutive weeks OR any goal in RED triggers exec escalation (Chief of Staff + affected owner + Chief Executive of the affected function).

### 4.4 Monthly — Cross-goal retro

Once per calendar month, a cross-goal retrospective runs. Chief of Staff invokes each owner-role and asks:
1. What surprises did we hit that other goals should know about?
2. Are any shared-file collisions imminent?
3. Any goal should be paused or accelerated?

Retrospective output: append to this doc's §9 (History log).

---

## 5. Red-flag escalation triggers

The orchestrator flags a goal as amber or red based on measurable triggers. When a red-flag fires, Chief of Staff pages the owner within 60 minutes of the next weekly review.

### 5.1 Per-goal amber triggers (any one)

- Any task in the goal's WSJF top-5 has been `in flight` for > 5 business days without ship.
- The goal's Week N ship date slips by > 3 business days.
- A cross-goal file conflict is detected (two sub-agents editing the same file in the same 24h window).
- The goal's owner-role has not written a Wednesday status for 2 consecutive weeks.
- Upstream dependency task not landed by Goal Week 1 (partial only — Goal Week 1 tasks may proceed on stub if upstream not shipped, but ship gate blocks).

### 5.2 Per-goal red triggers (any one)

- The goal's Week N ship date slips by > 10 business days.
- Any P0 finding from Goal 5A nightly review pings the goal's owned files and stays unremediated for > 5 business days.
- A hard-blocker upstream task slips by > 15 business days without a substitution plan.
- Goal 5A specific: any nightly review cycle fails 3 consecutive nights.
- Goal 5B specific: PDF render p95 > 15 seconds in staging.
- Goal 5C specific: `/index` renders 0 rows for > 24h post-launch OR ≤ 5 opted-in listings by end of Week 4.
- Goal 5D specific: Zalo OA registration blocked and no fallback plan by Week 2.

### 5.3 Portfolio-level red triggers

- ≥ 3 of the 4 goals in amber simultaneously → whole portfolio red.
- Chief of Staff has not run Monday review for 2 consecutive weeks → automatic portfolio amber.
- Cross-goal file lock unresolved for > 3 business days → portfolio amber.
- Analytics registry (T-1003) diverges across the 3 goals writing to it (schema drift) → portfolio red.

### 5.4 Response protocol

| Trigger level | First response | Escalation window |
|---------------|-----------------|-------------------|
| Goal amber | Owner writes mitigation note in Wednesday status | 5 business days |
| Goal red | Chief of Staff + owner meeting; freeze new task starts on that goal | 3 business days |
| Portfolio amber | Chief of Staff owner-sync across all 4 goals; re-baseline WSJF | 7 business days |
| Portfolio red | Halt all non-Goal-5A work; audit; re-plan | until root cause remediated |

---

## 6. Master WSJF-scored task list

Combined T-1101..T-1412 sorted by WSJF descending, then by goal-priority (5A > 5B > 5C > 5D per Chief of Staff prioritisation given quality-gate dependency shape).

WSJF = (bv + tc + rr) / effort. S=1, M=2, L=3.

| id | goal | task | effort | bv | tc | rr | wsjf | week |
|----|------|------|--------|----|----|----|------|-------|
| T-1105 | 5A | Telegram alert on P0/P1 | S | 4 | 5 | 4 | 13.0 | 3 |
| T-1102 | 5A | Scope glob + diff window | S | 4 | 4 | 4 | 12.0 | 1 |
| T-1103 | 5A | JSON schema validator | S | 4 | 3 | 5 | 12.0 | 1 |
| T-1109 | 5A | Crontab entry | S | 4 | 5 | 3 | 12.0 | 1 |
| T-1205 | 5B | Migration 0090 investor_pack_shares | S | 4 | 4 | 4 | 12.0 | 1 |
| T-1206 | 5B | Share link creation | S | 5 | 4 | 3 | 12.0 | 2 |
| T-1209 | 5B | 3 net-new analytics events | S | 4 | 4 | 4 | 12.0 | 1 |
| T-1305 | 5C | JSON-LD emission | S | 4 | 4 | 3 | 11.0 | 2 |
| T-1306 | 5C | Sitemap listings + rebuild cron | S | 4 | 4 | 3 | 11.0 | 2 |
| T-1107 | 5A | Cost tracker | S | 3 | 3 | 4 | 10.0 | 2 |
| T-1108 | 5A | Per-role budget guard | S | 3 | 3 | 4 | 10.0 | 3 |
| T-1312 | 5C | Public listing refresh cron | S | 4 | 3 | 3 | 10.0 | 3 |
| T-1110 | 5A | cron-runner endpoint mapping | S | 3 | 3 | 3 | 9.0 | 3 |
| T-1314 | 5C | Analytics event public_listing_view | S | 3 | 3 | 3 | 9.0 | 5 |
| T-1407 | 5D | Zalo subscribe endpoint | S | 3 | 3 | 3 | 9.0 | 3 |
| T-1408 | 5D | vi-zalo-digest cron | S | 3 | 3 | 3 | 9.0 | 3 |
| T-1409 | 5D | Accelerator partnership BD list | S | 4 | 3 | 2 | 9.0 | 5 |
| T-1411 | 5D | Analytics events vi_signup + vi_zalo_subscribed + vi_svi_computed | S | 3 | 3 | 3 | 9.0 | 4 |
| T-1112 | 5A | Documentation nightly-clevel-review runbook | S | 2 | 2 | 3 | 7.0 | 4 |
| T-1203 | 5B | POST /api/investor-pack/one-click | M | 5 | 5 | 3 | 6.5 | 2 |
| T-1301 | 5C | Migration 0092 public_listings | M | 5 | 4 | 4 | 6.5 | 1 |
| T-1401 | 5D | Locale routing + migration 0093 | M | 5 | 4 | 4 | 6.5 | 1 |
| T-1104 | 5A | Digest builder | M | 5 | 4 | 4 | 6.5 | 2 |
| T-1202 | 5B | assemble.ts | M | 5 | 4 | 3 | 6.0 | 1 |
| T-1207 | 5B | /pack/[shareId] hosted viewer | M | 5 | 4 | 3 | 6.0 | 3 |
| T-1402 | 5D | i18n loader + top-20 marketing translations | M | 5 | 4 | 3 | 6.0 | 1 |
| T-1302 | 5C | Ticker generator + ASX reserved list | M | 4 | 3 | 4 | 5.5 | 1 |
| T-1403 | 5D | VI onboarding wizard | M | 4 | 4 | 3 | 5.5 | 2 |
| T-1406 | 5D | Zalo broadcast client + migration 0094 | M | 4 | 4 | 3 | 5.5 | 3 |
| T-1410 | 5D | VI legal MDX extensions | M | 4 | 3 | 4 | 5.5 | 2 |
| T-1208 | 5B | Investor reply form | M | 4 | 3 | 3 | 5.0 | 3 |
| T-1211 | 5B | Traction chart SSR | M | 4 | 3 | 3 | 5.0 | 2 |
| T-1212 | 5B | Playwright regression | M | 3 | 3 | 4 | 5.0 | 4 |
| T-1308 | 5C | Comparable set query + cache | M | 4 | 3 | 3 | 5.0 | 4 |
| T-1309 | 5C | /submit form + partial SVI | M | 4 | 3 | 3 | 5.0 | 3 |
| T-1310 | 5C | Saved-search create flow | M | 4 | 3 | 3 | 5.0 | 4 |
| T-1311 | 5C | Cron saved-search-digest | M | 4 | 3 | 3 | 5.0 | 4 |
| T-1313 | 5C | Workspace /workspace/public-listing panel | M | 4 | 3 | 3 | 5.0 | 3 |
| T-1315 | 5C | Playwright regression public-index | M | 3 | 3 | 4 | 5.0 | 5 |
| T-1405 | 5D | 6 VI email templates + locale dispatch | M | 4 | 3 | 3 | 5.0 | 2 |
| T-1412 | 5D | Playwright regression vi-cohort | M | 3 | 3 | 4 | 5.0 | 5 |
| T-1106 | 5A | 3-night false-positive suppression | M | 3 | 3 | 3 | 4.5 | 3 |
| T-1204 | 5B | Preview endpoint + thumbnail cache | M | 4 | 3 | 2 | 4.5 | 2 |
| T-1210 | 5B | Workspace tile + CTA | M | 4 | 3 | 2 | 4.5 | 4 |
| T-1304 | 5C | /listings/[ticker] detail page | L | 5 | 4 | 4 | 4.33 | 2 |
| T-1201 | 5B | investor-pack.tsx top-level Document | L | 5 | 4 | 3 | 4.0 | 1 |
| T-1303 | 5C | /index server-rendered list + filter drawer | L | 5 | 4 | 3 | 4.0 | 1 |
| T-1307 | 5C | OpenGraph image generator | M | 3 | 3 | 2 | 4.0 | 4 |
| T-1111 | 5A | Workspace surface for digest | M | 3 | 3 | 2 | 4.0 | 4 |
| T-1101 | 5A | Orchestrator skeleton | L | 5 | 4 | 5 | 4.67 | 1 |
| T-1404 | 5D | 8 VI SEO articles | L | 4 | 4 | 3 | 3.67 | 4 |

51 tasks total. Effort sum: 5A = 14 (5S + 4M + 1L); 5B = 20 (2S + 8M + 2L); 5C = 21 (4S + 6M + 2L); 5D = 20 (5S + 6M + 1L). Grand total ≈ 75 person-days over 6-week windows = ~2 sub-agent-days per goal per week on average, well within parallel-agent capacity.

Note: two L-effort tasks (T-1101 orchestrator skeleton, T-1201 investor-pack template) score lower on WSJF than their week-1 slot suggests. They stay in Week 1 because they are hard blockers for everything downstream — pure WSJF sorting understates blocker weight.

---

## 7. Cross-goal collision matrix

Which sub-agent on which goal can safely run at what week without stepping on another. `OK` = go; `LOCK` = coordinate via file-lock; `BLOCK` = must not run in parallel.

| Week | 5A | 5B | 5C | 5D |
|------|----|----|----|-----|
| 1 | OK | OK | OK | OK |
| 2 | OK | LOCK: analytics registry with 5B+5C+5D | LOCK: same | LOCK: same |
| 3 | OK | OK | OK | LOCK: email.ts + crontab.production shared |
| 4 | OK | OK | LOCK: crontab.production + email.ts | LOCK: same |
| 5 | OK | OK (GA) | OK | LOCK: analytics event schema with 5C ongoing |
| 6 | (5A closed) | (5B closed) | OK (GA) | BLOCK on 5C /index route to fork |

### 7.1 Lock resolution protocol

When a lock is detected:
1. Orchestrator holds the second sub-agent for < 5 minutes.
2. If still contended, second sub-agent runs a `git pull --rebase` and retries on a fresh working copy.
3. If schema is genuinely divergent (both goals adding conflicting keys), orchestrator escalates to Chief of Staff — do NOT auto-resolve.

---

## 8. Escalation paths

### 8.1 Owner escalation ladder

For each goal, escalation flows: sub-agent → owner-role → Chief of Staff → Chief Executive.

- **Goal 5A:** sub-agent → CTO → Chief of Staff → Chief Executive (Auschain Pty Ltd).
- **Goal 5B:** sub-agent → CPO → Chief of Staff → Chief Executive.
- **Goal 5C:** sub-agent → CMO → Chief of Staff → Chief Executive.
- **Goal 5D:** sub-agent → CMO → Chief of Staff → Chief Executive.

### 8.2 Escalation SLA

- Sub-agent to owner: within same run (blocking).
- Owner to Chief of Staff: within 1 business day.
- Chief of Staff to Chief Executive: within 5 business days OR immediately for portfolio-red trigger.

### 8.3 Emergency stop

Chief of Staff has an emergency-stop for any goal. To invoke: touch `docs/goal-stops/<goal>.stop` (empty file). Orchestrator polls this path before every sub-agent spawn; presence of the file means no new sub-agents on that goal until the file is removed. Existing sub-agents complete their current turn and then stop.

---

## 9. History log

Append-only log of significant portfolio events. First row seeds the log; subsequent rows are Chief of Staff duty at Monday review.

| Date | Event | Impact |
|------|-------|--------|
| 2026-07-17 | Portfolio initialised. All 4 goals in Planned status. `platform-roadmap.tsx` extended with phases 9-12. | Baseline set. |
| — | (next Monday review entry here) | — |

---

## 10. Portfolio-level success criteria

The portfolio (all 4 goals) is considered "landed" when:

- **Goal 5A:** ≥ 1 P0/P1 regression caught per week for 4 consecutive weeks post-launch; false-positive rate < 20%.
- **Goal 5B:** ≥ 20% of Growth/Scale subscribers generate ≥ 1 pack in first 30 days.
- **Goal 5C:** ≥ 100 opted-in listings + ≥ 30 organic sessions/day to `/listings/*` within 60 days.
- **Goal 5D:** ≥ 20 VI signups + 1 signed accelerator partnership within 90 days.

Failure of any single goal does NOT block the others' close. Each goal ships and measures independently.

---

## 11. Non-goals for the orchestrator

The orchestrator does NOT:

- Prioritise urgent bugs above the goal task list. Emergency fixes route through the standard CTO agent, not this orchestrator.
- Rewrite the goal docs. Amendments to a goal's scope require Chief of Staff sign-off and become new sections in the goal's own doc.
- Merge goals. Any consolidation is a portfolio-level replan.
- Retire a goal on its own authority. Retirement requires Chief of Staff + Chief Executive sign-off.
- Estimate cost. Cost tracking lives in the goal docs themselves + `web/content/reports/nightly-review-costs.jsonl` (5A) + Anthropic dashboard.

---

## 12. Cross-references

- v3.1 amendment: `docs/IMPLEMENTATION-PLAN-v3.1-amended.md`
- v3 trunk: `docs/IMPLEMENTATION-PLAN-v3.md`
- Goal docs:
  - `docs/goal-5a-autonomous-quality-gate.md`
  - `docs/goal-5b-investor-pack-v2.md`
  - `docs/goal-5c-au-startup-public-index.md`
  - `docs/goal-5d-vi-founder-cohort.md`
- Roadmap surface: `web/src/components/workspace/platform-roadmap.tsx`
- Status feed: `web/content/reports/goal-status.jsonl` (created on first Monday review)
- Owner briefs: `docs/owner-briefs/*` (created lazily)
- Emergency stops: `docs/goal-stops/*.stop`

---

*End of orchestrator tracking. Owned by Chief of Staff. Update every Monday at 09:00 AEST.*
