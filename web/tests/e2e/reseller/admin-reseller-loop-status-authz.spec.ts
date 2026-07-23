// GET /api/admin/reseller-loop/status pre-read authorization contract —
// P10 dry-run per plan §C.5 (admin surfaces) and §J.2 (Playwright must
// cover the admin surfaces so a regression in the requireAdmin() gate
// ordering surfaces before the endpoint reads /tmp/blockid-reseller-
// monitor.txt or the two on-disk JSONL logs it tails).
//
// Mirrors admin-resellers-list-authz.spec.ts (tick 108),
// admin-reseller-detail-authz.spec.ts, admin-reseller-patch-authz.spec.ts
// (tick 103), admin-reseller-delete-authz.spec.ts (tick 106),
// admin-requests-list-authz.spec.ts (tick 107) and
// admin-requests-patch-authz.spec.ts (tick 105) — same requireAdmin()
// chokepoint from web/src/lib/reseller/require-admin.ts (see
// route.ts:41-49), same { ok:false, reason: AdminGateError.code }
// envelope pair at HTTP 401 for BOTH the no_user and not_admin branches
// (route.ts:45-47). Symmetric shape means a refactor that collapses the
// two 401 reasons into a single "unauthorised", swaps requireAdmin() for
// a bespoke inline check, or flips the status code to 403 lights up in
// all seven specs on the next `npx playwright test` pass.
//
// This spec closes the last uncovered admin surface under /api/admin/**
// whose requireAdmin() gate was not yet regression-guarded at the
// Playwright lens — every sibling admin reseller endpoint already has
// one. Both harness-free branches are safe against staging: the on-disk
// reads under Promise.all (route.ts:51-56) never fire, and the response
// never includes the /tmp snapshot or the tick history, so no reseller-
// scoped state is observable from an unauthorised probe.
//
// Two branches are harness-free and safe against staging (no on-disk
// reads fire, no write is issued, no admin state changes):
//
//   1. unauthenticated  — GET with no session       → 401 { ok:false, reason:"no_user" }
//                          (getCurrentUser null → requireAdmin throws
//                          AdminGateError("no_user") → gate returns 401
//                          BEFORE the Promise.all safeRead fan-out fires
//                          against /tmp/blockid-reseller-monitor.txt,
//                          reseller-monitor.jsonl, reseller-goal-
//                          history.jsonl, or /tmp/blockid-reseller-goal-done)
//   2. non_admin        — GET as a founder QA account → 401 { ok:false, reason:"not_admin" }
//                          (getCurrentUser resolves but user.role !== "admin"
//                          and user.email !== ADMIN_EMAIL → isAdmin false →
//                          requireAdmin throws AdminGateError("not_admin") →
//                          gate returns 401 BEFORE the Promise.all fan-out)
//
// Route reference: web/src/app/api/admin/reseller-loop/status/route.ts
//   Line 41-49:  getCurrentUser + requireAdmin → 401 no_user / not_admin
//   Line 51-56:  Promise.all safeRead of MONITOR_TXT + MONITOR_JSONL +
//                HISTORY_JSONL + DONE_MARKER
//   Line 58-76:  tailLines + JSON.parse fan-out for monitor + tick rows
//   Line 78-88:  200 { ok:true, complete, completed_at, snapshot,
//                     monitor_history, tick_history, generated_at }
//
// Skips:
//   Row 2 skips at test-scope if the qa-founder-1 account is not seeded
//   (loginAs throws). Row 1 always runs — no harness required — so this
//   spec lights up in CI on the next `npx playwright test` pass alongside
//   the six sibling admin authz specs.
//
// Deliberately out of scope (needs the admin QA harness or per-test
// seeding which plan §J.2 forbids):
//   - Happy path (200 with monitor_history + tick_history) — ACTIVATED
//     wave-5 row 173 (tick 161). Opens via loadAdminHarness()
//     (qa-admin-1@blockid.au) so the requireAdmin() gate at route.ts:41-49
//     passes. Read-only GET — no writes fire, so this row is idempotent
//     under CI replay. The on-disk sources tail every tick (safeRead against
//     /tmp + JSONL logs) so ARRAY LENGTHS and CONTENT are NOT pinned; the
//     assertions cover only the envelope shape (ok=true, complete boolean,
//     completed_at string|null, snapshot string, monitor_history array,
//     tick_history array, generated_at ISO string) so a route regression
//     that dropped a field or flipped an array to an object surfaces here.
//     Non-Stripe / non-GST — this endpoint reads /tmp + on-disk JSONL only.
//
// The GET handler takes no query params, so both harness-free rows return
// BEFORE any URL parse fires — no path segment or search string is needed
// on either request.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { adminHarnessSkipReason, loadAdminHarness } from "../fixtures/reseller";

const NON_ADMIN_FOUNDER_EMAIL =
  process.env.QA_UNATTRIBUTED_FOUNDER_EMAIL ?? "qa-founder-1@blockid.au";

const ROUTE = "/api/admin/reseller-loop/status";

const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

test.describe("Admin reseller-loop status pre-read authorization — P10 dry-run", () => {
  test("unauthenticated — GET with no session returns 401 no_user", async ({
    request,
  }) => {
    const resp = await request.get(ROUTE);
    expect(
      resp.status(),
      `unauthenticated returned ${resp.status()} — expected 401 before the Promise.all safeRead fan-out fires against /tmp/blockid-reseller-monitor.txt or the two JSONL logs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `unauthenticated body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("no_user");
  });

  test("non_admin — GET as a founder QA account returns 401 not_admin", async ({
    page,
  }) => {
    try {
      await loginAs(page, NON_ADMIN_FOUNDER_EMAIL);
    } catch (err) {
      test.skip(
        true,
        `Non-admin founder account not seeded: ${(err as Error).message}. ` +
          `Run scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }
    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `non_admin returned ${resp.status()} — expected 401 not_admin before the Promise.all safeRead fan-out fires against /tmp/blockid-reseller-monitor.txt or the two JSONL logs. Body: ${await resp.text()}`,
    ).toBe(401);
    const body = (await resp.json()) as { ok: boolean; reason?: string };
    expect(
      body.ok,
      `non_admin body.ok should be false: ${JSON.stringify(body)}`,
    ).toBe(false);
    expect(body.reason).toBe("not_admin");
  });
});

test.describe("Admin reseller-loop status — P10 wave-5 row 173 happy path", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test("happy — GET as qa-admin-1 returns 200 with snapshot + tail arrays", async ({
    page,
  }) => {
    try {
      await loginAs(page, harness!.admin.email);
    } catch (err) {
      test.skip(
        true,
        `Admin QA account not seeded: ${(err as Error).message}. Run ` +
          `scripts/seed-test-users.mjs to populate /tmp/blockid-qa-accounts.txt.`,
      );
      return;
    }

    const resp = await page.request.get(ROUTE);
    expect(
      resp.status(),
      `happy returned ${resp.status()} — expected 200 after requireAdmin() passes. Body: ${await resp.text()}`,
    ).toBe(200);

    const body = (await resp.json()) as {
      ok?: unknown;
      complete?: unknown;
      completed_at?: unknown;
      snapshot?: unknown;
      monitor_history?: unknown;
      tick_history?: unknown;
      generated_at?: unknown;
    };

    expect(
      body.ok,
      `happy body.ok should be true: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      typeof body.complete,
      `happy body.complete should be boolean: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe("boolean");
    // completed_at is either an ISO string (when DONE_MARKER present) or null.
    if (body.completed_at !== null) {
      expect(
        typeof body.completed_at,
        `happy body.completed_at should be string or null: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe("string");
    }
    // Complete/completed_at pair must be consistent — if complete then
    // completed_at is a non-empty string; if not complete then it's null.
    if (body.complete === true) {
      expect(
        typeof body.completed_at === "string" &&
          (body.completed_at as string).length > 0,
        `happy body.completed_at should be non-empty string when complete=true: ${JSON.stringify(body).slice(0, 200)}`,
      ).toBe(true);
    } else {
      expect(body.completed_at).toBeNull();
    }
    expect(
      typeof body.snapshot,
      `happy body.snapshot should be string (empty when /tmp/blockid-reseller-monitor.txt absent): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe("string");
    expect(
      Array.isArray(body.monitor_history),
      `happy body.monitor_history should be an array (tailLines→JSON.parse fan-out): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    expect(
      Array.isArray(body.tick_history),
      `happy body.tick_history should be an array (tailLines→JSON.parse fan-out): ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
    // Do NOT pin monitor_history.length or tick_history.length — the on-disk
    // JSONL logs mutate every tick (cron writes reseller-monitor.jsonl every
    // minute; the autonomous loop writes reseller-goal-history.jsonl every
    // tick); fresh CI hosts hold 0 rows; production hosts hold up to 30/40.
    // Every parsed row is a plain object (JSON.parse fallback returns null →
    // .filter(Boolean) drops non-objects), so a regression that swapped the
    // fan-out to return raw strings surfaces here.
    for (const row of (body.monitor_history as unknown[]) ?? []) {
      expect(
        row !== null && typeof row === "object" && !Array.isArray(row),
        `monitor_history row should be a plain object: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Writer schema pin — scripts/cron/reseller-monitor.sh:58-64 constructs
      // every row with `monitor_ts` (Python datetime.now().isoformat()) +
      // `head_sha` (git rev-parse --short with "unknown" fallback) then
      // spreads the show-next-reseller-tick.sh state + `last_log`. `monitor_ts`
      // and `head_sha` are schema-level guarantees from the writer, so a
      // regression that renamed either column (or the fan-out that stopped
      // populating them) surfaces here. typeof-string only — do NOT ISO-pin
      // monitor_ts per tick 230's "assert typeof string only so the value can
      // drift" convention for timestamps. No twin surface (singleton endpoint).
      const monitorRow = row as Record<string, unknown>;
      expect(
        typeof monitorRow.monitor_ts,
        `monitor_history row.monitor_ts should be typeof string (reseller-monitor.sh:59 writer schema): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.head_sha,
        `monitor_history row.head_sha should be typeof string (reseller-monitor.sh:60 writer schema; falls back to "unknown" when git rev-parse fails): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      // Writer schema pin (tick 236 option s) — reseller-monitor.sh:55-57
      // sets `last_log_obj = json.loads(last_log) if last_log.strip() else {}`
      // inside a try/except that also falls back to `{}` on parse error, then
      // reseller-monitor.sh:62 spreads `"last_log": last_log_obj` into every
      // appended row. `last_log` is therefore a schema-level guarantee from the
      // writer — always present, always a plain object (never null, never
      // array, never a scalar). Landing a plain-object pin catches a writer
      // regression that renamed the key, replaced the `{}` fallback with
      // None/null, or a python-side crash that produced an empty row. No
      // per-key content pins on last_log — its shape mirrors whatever the
      // reseller-goal-loop.mjs last-line schema happens to be at read time, and
      // that is already pinned on the tick_history rows above. No twin surface
      // (singleton endpoint), same rationale as monitor_ts + head_sha.
      expect(
        monitorRow.last_log !== null &&
          typeof monitorRow.last_log === "object" &&
          !Array.isArray(monitorRow.last_log),
        `monitor_history row.last_log should be a plain object (reseller-monitor.sh:55-57 last_log_obj fallback + reseller-monitor.sh:62 spread): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Writer schema pin (tick 238 option w) — reseller-monitor.sh:43
      // captures STATE_JSON from `bash show-next-reseller-tick.sh --json`
      // which prints a fixed 8-key printf at show-next-reseller-tick.sh:137-138
      // (now_utc, next_utc, seconds_until, tick_state, last_tick_id,
      // last_dispatch_ms, last_deploy_stage, last_deploy_status). The
      // python block at reseller-monitor.sh:47-64 spreads that state via
      // `**state` into every appended row (line 61), so under the
      // normal writer path (cron entry present, DONE_MARKER absent) all
      // 8 keys are schema-level guarantees. Confirmed on-disk against
      // reseller-monitor.jsonl — every row (head + tail sampled) carries
      // all 11 keys (monitor_ts + head_sha + last_log + these 8).
      // typeof-string only for now_utc / next_utc / tick_state /
      // last_tick_id per tick 230's "assert typeof string only so the
      // value can drift" convention (timestamps + free-form state
      // strings + variable-length id). typeof-number for seconds_until /
      // last_dispatch_ms / last_deploy_status because the printf at
      // show-next-reseller-tick.sh:137 uses %d specifiers so those
      // fields are JSON numbers not strings. last_deploy_stage has a
      // ${LAST_DEPLOY_STAGE:-none} default at show-next-reseller-tick.sh:138
      // so it is always a non-empty string ("none" fallback). No twin
      // surface (singleton endpoint), same rationale as monitor_ts +
      // head_sha + last_log. Closes audit option (w) as a set — all 8
      // state-spread fields pinned in one tick since they all share
      // the same conditional-on-json-path-success guarantee and the
      // set is small enough to land coherently without partitioning.
      expect(
        typeof monitorRow.now_utc,
        `monitor_history row.now_utc should be typeof string (show-next-reseller-tick.sh:137 printf %s from date -u +%H:%M:%S): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.next_utc,
        `monitor_history row.next_utc should be typeof string (show-next-reseller-tick.sh:137 printf %s from date -u -d @NEXT_TS_UTC +%H:%M): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.seconds_until,
        `monitor_history row.seconds_until should be typeof number (show-next-reseller-tick.sh:137 printf %d from arithmetic SECS_UNTIL): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        typeof monitorRow.tick_state,
        `monitor_history row.tick_state should be typeof string (show-next-reseller-tick.sh:124-131 TICK_STATE always assigned "idle" / "RUNNING..." / "last tick deploy FAILED..." / "idle — last tick ended cleanly"): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.last_tick_id,
        `monitor_history row.last_tick_id should be typeof string (show-next-reseller-tick.sh:137 printf %s from LAST_TICK_ID; empty string when no history rows yet): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.last_dispatch_ms,
        `monitor_history row.last_dispatch_ms should be typeof number (show-next-reseller-tick.sh:138 printf %s of \${LAST_DISPATCH_ELAPSED:-0} — bare integer coalesces to JSON number since printf format is %s but the value slot is unquoted): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      expect(
        typeof monitorRow.last_deploy_stage,
        `monitor_history row.last_deploy_stage should be typeof string (show-next-reseller-tick.sh:138 printf %s of \${LAST_DEPLOY_STAGE:-none} — always a non-empty string, "none" fallback): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof monitorRow.last_deploy_status,
        `monitor_history row.last_deploy_status should be typeof number (show-next-reseller-tick.sh:138 printf %s of \${LAST_DEPLOY_STATUS:-0} — bare integer coalesces to JSON number): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
    }
    for (const row of (body.tick_history as unknown[]) ?? []) {
      expect(
        row !== null && typeof row === "object" && !Array.isArray(row),
        `tick_history row should be a plain object: ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe(true);
      // Writer schema pin — scripts/cron/reseller-goal-loop.mjs:52-58 log()
      // helper prepends `tick_id` (from `new Date().toISOString().replace(/
      // [:.]/g, '-')`) + `ts` (`new Date().toISOString()`) + `human_review_
      // minutes_7d` (number sampled once per process), then merges `...row`
      // where every call site passes a `stage` string (see the ??  'unknown'
      // default at mjs:70). Those four fields are schema-level guarantees from
      // the writer, so a regression that renamed any column (or a call site
      // that stopped passing stage) surfaces here. typeof-string only for
      // tick_id/ts/stage per tick 230's "assert typeof string only so the
      // value can drift" convention for timestamps + free-form enum strings.
      // No twin surface (singleton endpoint).
      const tickRow = row as Record<string, unknown>;
      expect(
        typeof tickRow.tick_id,
        `tick_history row.tick_id should be typeof string (reseller-goal-loop.mjs:54 writer schema): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof tickRow.ts,
        `tick_history row.ts should be typeof string (reseller-goal-loop.mjs:55 writer schema): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      expect(
        typeof tickRow.stage,
        `tick_history row.stage should be typeof string (reseller-goal-loop.mjs:70 default 'unknown' guarantees presence at every call site): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("string");
      // Writer schema pin (tick 237 option v) — reseller-goal-loop.mjs:44
      // declares `let HUMAN_REVIEW_MINUTES_7D = 0` (typeof=number), then the
      // try/catch at :45-47 either reassigns from sumHumanReviewMinutes7d()
      // (which always returns a number — 0 fallback or total sum per
      // scripts/cron/human-review-minutes.mjs:24-48) or leaves the 0 default
      // in place. The log() helper at :52-58 then spreads
      // `human_review_minutes_7d: HUMAN_REVIEW_MINUTES_7D` into every appended
      // row. It is therefore a schema-level guarantee from the writer — always
      // present, always typeof=number (never null, never string, never
      // undefined). Landing this pin closes the last un-pinned writer-
      // guaranteed field on the tick_history row (tick 235 pinned tick_id +
      // ts + stage), catching (a) a writer regression that renamed the key;
      // (b) a helper regression that returned a non-number (e.g. Promise
      // <string>) so the spread landed a stringified number in the row;
      // (c) a call site that stripped the KPI from the log envelope. No
      // value pin — the number drifts with cumulative human handoff cost per
      // CHRO §26 rec #1. No twin surface (singleton endpoint), same
      // rationale as monitor_ts + head_sha + last_log.
      expect(
        typeof tickRow.human_review_minutes_7d,
        `tick_history row.human_review_minutes_7d should be typeof number (reseller-goal-loop.mjs:44 default 0 + :57 spread guarantee): ${JSON.stringify(row).slice(0, 200)}`,
      ).toBe("number");
      // Writer schema pin (tick 239 option y — first conditional-by-stage
      // pin). scripts/cron/reseller-goal-loop.mjs:287 writes
      // `log({ stage: 'frontier_computed', frontier_count: frontier.length,
      // frontier })` — frontier_count is `Array.prototype.length` on the
      // return value of computeFrontier() so it is a schema-level number
      // guarantee (never null, never string, never absent) on every
      // frontier_computed row. Landing a conditional pin — narrow to the
      // one stage — catches (a) a writer regression that renamed the key
      // (e.g. frontier_count → frontier_len) and (b) a call-site regression
      // that dropped the frontier_count field from the spread. Departs from
      // the singleton-endpoint convention only in the sense that this pin
      // is guarded by `if (stage === 'frontier_computed')` — the writer
      // contract is stage-specific, so the pin has to be too. Other stages
      // (tick_start, tick_end, delegated_dispatch, auto_deploy_*, etc.)
      // carry their own stage-specific extras; per-stage audit closure of
      // option (y) is deferred to future ticks — this one starts the
      // pattern by landing the frontier_computed guarantee (the only stage
      // whose row we know computeFrontier() populates deterministically
      // via .length). No value pin — the count varies per goal state; the
      // frontier field itself is a plain array whose shape is documented
      // inline at buildPhaseBrief in mjs:296-303 but not pinned here to
      // keep the diff bounded to the numeric field. No twin surface
      // (singleton endpoint), same rationale as tick_id + ts + stage +
      // human_review_minutes_7d.
      if (tickRow.stage === "frontier_computed") {
        expect(
          typeof tickRow.frontier_count,
          `tick_history frontier_computed row.frontier_count should be typeof number (reseller-goal-loop.mjs:287 writes frontier.length): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
      }
      // Writer schema pin (tick 240 option y2 — second conditional-by-stage
      // pin, symmetric with the frontier_computed pattern landed tick 239).
      // scripts/cron/reseller-goal-loop.mjs:301 writes
      // `log({ stage: 'phase_failed', label: result.label, status: result.status })`
      // where `result` is the return value of dispatchToClaude() at mjs:190-205
      // which constructs `{ status: res.status ?? -1, elapsed_ms, signal, label }`.
      // `label` is threaded in at mjs:298 as `${entry.track}:${entry.phase}` —
      // a template literal over string keys from computeFrontier() (mjs:147:
      // `frontier.push({ track: t, phase: name, ... })` where t/name come from
      // Object.keys(goal.tracks) + Object.entries(...phases)). So `label` is a
      // schema-level typeof=string guarantee. `status` is `res.status ?? -1`
      // where `res` is the spawnSync result — `.status` is `number | null` and
      // the ?? -1 fallback narrows it to a JSON number every time. Landing a
      // stage-guarded pin catches (a) a writer regression that renamed either
      // key on the log envelope; (b) a dispatchToClaude() regression that
      // dropped the ?? -1 fallback so status could land as null; (c) a
      // label-composition regression that swapped the template literal for an
      // object shape. No value pin — labels vary per frontier entry; the -1
      // status is a legitimate observation of a spawn that failed to launch.
      // Skipped on hosts where the loop has never taken the `if
      // (result.status !== 0)` branch at mjs:300 — the pin has no effect on
      // green-path hosts, same natural side effect as the tick 239 frontier_
      // computed guard. Matches the tick 239 "one stage per pass" amortisation
      // note — future ticks can land the remaining ~17 stage-specific extras
      // (auto_deploy_finished, idle, phase_dispatched, delegated_dispatch,
      // etc.) as similar two-line conditional blocks without partitioning.
      if (tickRow.stage === "phase_failed") {
        expect(
          typeof tickRow.label,
          `tick_history phase_failed row.label should be typeof string (reseller-goal-loop.mjs:298 threads \`\${entry.track}:\${entry.phase}\` through dispatchToClaude → mjs:301 spread): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
        expect(
          typeof tickRow.status,
          `tick_history phase_failed row.status should be typeof number (reseller-goal-loop.mjs:204 dispatchToClaude returns \`res.status ?? -1\` → mjs:301 spread): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
      }
      // Writer schema pin (tick 241 option y4 — third conditional-by-stage pin,
      // symmetric with the frontier_computed pattern landed tick 239 and the
      // phase_failed pattern landed tick 240). scripts/cron/reseller-goal-loop.mjs:290
      // writes `log({ stage: 'idle', reason: 'no unblocked phases' })` inside the
      // `if (frontier.length === 0)` branch that guards the early-exit when
      // computeFrontier() returns no unblocked entries. `reason` is a bare string
      // literal at the call site — schema-level typeof=string guarantee (never
      // null, never object, never absent). The log() helper at mjs:52-58 prepends
      // tick_id/ts/human_review_minutes_7d then spreads `...row` — the
      // `reason: 'no unblocked phases'` keyval flows through untouched. Landing a
      // stage-guarded pin catches (a) a writer regression that renamed the key
      // (e.g. reason → cause); (b) a call-site regression that swapped the string
      // literal for a non-string (e.g. an Error object or an array). No value pin
      // — the reason wording may drift as future ticks add other early-exit
      // branches (e.g. all-human-blocked snapshot with a different reason string)
      // and the pin should tolerate that drift per tick 230's "assert typeof
      // string only so the value can drift" convention. Skipped on hosts where
      // the loop has never taken the frontier-empty branch — the pin has no
      // effect on hosts with an active frontier, same natural side effect as the
      // tick 239 frontier_computed guard + tick 240 phase_failed guard. Simplest
      // stage-specific extras remaining (single-key, single-typeof guarantee,
      // no writer-side conditional narrowing needed) so it lands as a two-line
      // conditional block without additional audit — writer contract is
      // trivially inspectable at mjs:290.
      if (tickRow.stage === "idle") {
        expect(
          typeof tickRow.reason,
          `tick_history idle row.reason should be typeof string (reseller-goal-loop.mjs:290 writes bare string literal 'no unblocked phases'): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // Writer schema pin (tick 242 option y5 — fourth conditional-by-stage pin,
      // symmetric two-pin shape matching tick 240's phase_failed guard). scripts/
      // cron/reseller-goal-loop.mjs:337 writes `log({ stage: 'auto_commit_
      // finished', commit_status: c.status ?? -1, push_status: p.status ?? -1 })`
      // inside the safety-net commit branch at mjs:328-341 that fires whenever
      // the Claude CLI subprocess landed dirty files but did not commit them.
      // Both `c` and `p` are spawnSync results from `git commit` / `git push`
      // (mjs:335-336) so `.status` is `number | null` on the Node.js contract —
      // the `?? -1` fallback narrows both to a JSON number every time. Schema-
      // level typeof=number guarantee on both keys. The log() helper at
      // mjs:52-58 prepends tick_id/ts/human_review_minutes_7d then spreads
      // `...row` — both keyvals flow through untouched. Landing a stage-guarded
      // two-pin block catches (a) a writer regression that renamed either key
      // on the log envelope; (b) a mjs:335 or :336 spawnSync regression that
      // dropped the `?? -1` fallback so either status could land as null; (c) a
      // call-site regression that swapped the spread for a bare object shape.
      // No value pin — the status codes drift with git subprocess outcomes
      // (0 on success, 1 on nothing-to-commit, other non-zero on push failure,
      // -1 when spawnSync itself fails to launch git). Skipped on hosts where
      // the loop has never taken the dirty-tree branch — the pin has no effect
      // on hosts where every phase committed inline, same natural side effect
      // as the tick 239 frontier_computed guard + tick 240 phase_failed guard +
      // tick 241 idle guard. Two pins in one guard because commit_status +
      // push_status share the same conditional at mjs:331 — they always land
      // together on the same row, so the guard cost is amortised (matches tick
      // 240's phase_failed two-pin rationale verbatim except for the stage
      // literal + spawnSync source line citations).
      if (tickRow.stage === "auto_commit_finished") {
        expect(
          typeof tickRow.commit_status,
          `tick_history auto_commit_finished row.commit_status should be typeof number (reseller-goal-loop.mjs:337 writes \`c.status ?? -1\` from spawnSync git commit at mjs:335): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
        expect(
          typeof tickRow.push_status,
          `tick_history auto_commit_finished row.push_status should be typeof number (reseller-goal-loop.mjs:337 writes \`p.status ?? -1\` from spawnSync git push at mjs:336): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
      }
      // Writer schema pin (tick 243 option y7 — fifth conditional-by-stage pin,
      // symmetric one-pin single-guard shape matching tick 241's idle guard).
      // scripts/cron/reseller-goal-loop.mjs:332 writes `log({ stage:
      // 'auto_commit_started', dirty_files: dirty.split('\n').length })` inside
      // the safety-net commit branch at mjs:328-341 that fires whenever the
      // Claude CLI subprocess landed uncommitted edits. `dirty` is the trimmed
      // stdout of `git status --porcelain` (mjs:329-330); `dirty.split('\n').
      // length` is `Array.prototype.length` on the split result so it is a
      // schema-level typeof=number guarantee (never null, never string, never
      // absent — the branch is only entered when `dirty` is a non-empty string
      // per the `if (dirty)` guard at mjs:331, so the split always returns
      // ≥1 element and .length is always ≥1). The log() helper at mjs:52-58
      // prepends tick_id/ts/human_review_minutes_7d then spreads `...row` — the
      // `dirty_files` keyval flows through untouched. Landing a stage-guarded
      // pin catches (a) a writer regression that renamed the key (e.g.
      // dirty_files → uncommitted_count); (b) a call-site regression that
      // swapped `.length` for the raw split array (typeof would flip to
      // 'object' since arrays are objects); (c) a call-site regression that
      // dropped the field from the spread. No value pin — the count drifts
      // with subprocess edit volume per tick. Skipped on hosts where the loop
      // has never taken the dirty-tree branch — the pin has no effect on hosts
      // where every phase committed inline, same natural side effect as the
      // tick 239 frontier_computed guard + tick 240 phase_failed guard + tick
      // 241 idle guard + tick 242 auto_commit_finished guard. Restores the
      // one-pin / two-pin alternation cadence established by ticks 239-242
      // (frontier_computed: 1 → phase_failed: 2 → idle: 1 → auto_commit_
      // finished: 2 → auto_commit_started: 1). Paired writer contract with
      // the tick 242 auto_commit_finished guard — auto_commit_started fires
      // at mjs:332 immediately before the git commit+push at mjs:335-336
      // whose results feed auto_commit_finished at mjs:337, so both rows land
      // together whenever the dirty-tree branch is taken.
      if (tickRow.stage === "auto_commit_started") {
        expect(
          typeof tickRow.dirty_files,
          `tick_history auto_commit_started row.dirty_files should be typeof number (reseller-goal-loop.mjs:332 writes \`dirty.split('\\n').length\` — Array.prototype.length): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
      }
      // Writer schema pin (tick 244 option y8 — sixth conditional-by-stage pin,
      // symmetric two-pin shape matching tick 240's phase_failed guard + tick
      // 242's auto_commit_finished guard). scripts/cron/reseller-goal-loop.mjs:218
      // writes `log({ stage: 'error', where: 'readGoal', error: String(err) })`
      // inside the try/catch at mjs:214-220 that wraps `readGoal()` — the only
      // `stage: 'error'` writer in the loop (grep-verified: 1 match at mjs:218).
      // `where` is a bare string literal at the call site — schema-level
      // typeof=string guarantee (never null, never object, never absent — the
      // one call site passes the static literal 'readGoal'). `error` is
      // `String(err)` where err is the caught exception — the `String()` cast
      // narrows any throwable (Error, string, null, undefined, number, arbitrary
      // object with toString) to a JSON string, so it is a schema-level
      // typeof=string guarantee too (never null, never absent, never a
      // non-string primitive). The log() helper at mjs:52-58 prepends
      // tick_id/ts/human_review_minutes_7d then spreads `...row` — both keyvals
      // flow through untouched. Landing a stage-guarded two-pin block catches
      // (a) a writer regression that renamed either key on the log envelope;
      // (b) a call-site regression that dropped the `String()` cast so `error`
      // could land as a non-string (Error object, null, etc.); (c) a future
      // call site that added a `stage: 'error'` write without passing both
      // keys. No value pin — `where` may drift as future try/catch blocks add
      // other error-emit sites with different tag strings, and `error` varies
      // with subprocess/IO failure modes; the pin should tolerate that drift
      // per tick 230's "assert typeof string only so the value can drift"
      // convention. Skipped on hosts where the loop has never taken the
      // readGoal-throws branch (i.e. every host where docs/plans/reseller-
      // module-goal.md exists and is readable) — the pin has no effect on
      // green-path hosts, same natural side effect as the tick 239
      // frontier_computed guard + tick 240 phase_failed guard + tick 241 idle
      // guard + tick 242 auto_commit_finished guard + tick 243 auto_commit_
      // started guard. Two pins in one guard because where + error share the
      // same conditional at mjs:217 — they always land together on the same
      // row, so the guard cost is amortised (matches tick 240's phase_failed
      // two-pin rationale + tick 242's auto_commit_finished two-pin rationale
      // verbatim except for the stage literal + writer source line citations).
      // Restores the one-pin / two-pin alternation cadence established by
      // ticks 239-243 (frontier_computed: 1 → phase_failed: 2 → idle: 1 →
      // auto_commit_finished: 2 → auto_commit_started: 1 → error: 2).
      if (tickRow.stage === "error") {
        expect(
          typeof tickRow.where,
          `tick_history error row.where should be typeof string (reseller-goal-loop.mjs:218 writes bare string literal 'readGoal'): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
        expect(
          typeof tickRow.error,
          `tick_history error row.error should be typeof string (reseller-goal-loop.mjs:218 writes \`String(err)\` — narrows any throwable to a JSON string): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // tick 245 — human_blocked_snapshot stage schema pin (option y9;
      // symmetric two-pin shape matching tick 240's phase_failed guard +
      // tick 242's auto_commit_finished guard + tick 244's error guard).
      // scripts/cron/reseller-goal-loop.mjs:228-232 writes
      // `log({ stage: 'human_blocked_snapshot', count: humanBlocked.length,
      // entries: humanBlocked })` inside the try/catch at mjs:226-235 that
      // fires on EVERY tick (not branch-conditional) so this guard executes
      // on every green-path CI run — highest coverage-per-guard of any
      // remaining stage. Two pins in one guard because count + entries share
      // the same conditional at mjs:229 — they always land together on the
      // same row, so the guard cost is amortised (matches tick 240 + 242 +
      // 244 two-pin rationale verbatim except for the stage literal + writer
      // source line citations). Breaks the one-pin / two-pin alternation
      // cadence (three consecutive two-pins: 244 error, 245 human_blocked_
      // snapshot, and the next natural two-pin candidate) — coverage-per-
      // guard advantage outweighs the pattern-preservation preference per
      // tick 244's y9 rationale. count is `humanBlocked.length` (Array.
      // prototype.length; typeof=number schema guarantee, never null, never
      // absent, always >=0). entries is `humanBlocked` (the array itself;
      // Array.isArray schema guarantee from extractHumanBlockedSnapshot
      // which returns an array on the happy path). Comes AFTER the error
      // stage guard because the writer contract emits human_blocked_snapshot
      // on every tick's happy path, but the row order in tick_history is
      // determined by log() insertion time — pin order in the spec does not
      // need to mirror it since each guard is an independent stage check.
      if (tickRow.stage === "human_blocked_snapshot") {
        expect(
          typeof tickRow.count,
          `tick_history human_blocked_snapshot row.count should be typeof number (reseller-goal-loop.mjs:230 writes \`humanBlocked.length\` — Array.prototype.length): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
        expect(
          Array.isArray(tickRow.entries),
          `tick_history human_blocked_snapshot row.entries should be Array.isArray (reseller-goal-loop.mjs:231 writes \`humanBlocked\` — the array returned by extractHumanBlockedSnapshot): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe(true);
      }
      // tick 246 — tick_start (mjs:212) and tick_end (mjs:375) rows are
      // intentionally NOT stage-guarded here (option y10, documentation-only
      // pass). Both writer sites emit `log({ stage: '<literal>' })` with NO
      // stage-specific extras beyond the log() helper's baseline spread
      // (tick_id + ts + stage + human_review_minutes_7d, all already pinned
      // above as unconditional row-level assertions from ticks 235 + 237).
      // Grep-verified: `stage: 'tick_start'` matches exactly 1 site at
      // mjs:212 and `stage: 'tick_end'` matches exactly 1 site at mjs:375,
      // both bare single-key log() calls. Landing a conditional guard would
      // add a no-op `if` block with no expect statements — the four baseline
      // pins already fire on every row regardless of stage, so a tick_start /
      // tick_end guard would be strictly redundant. Documenting the audit
      // closure here so future ticks do not re-open y10 as "still available".
      // Restores the one-pin cadence after three consecutive two-pin
      // additions (244 error, 245 human_blocked_snapshot) — cheapest possible
      // tick per tick 245's y10 note ("documentation only. Restores the one-
      // pin cadence after two consecutive two-pins").
      // tick 247 — auto_deploy_triggered stage schema pin (option y14;
      // symmetric two-pin shape matching tick 240's phase_failed guard +
      // tick 242's auto_commit_finished guard + tick 244's error guard +
      // tick 245's human_blocked_snapshot guard). scripts/cron/reseller-
      // goal-loop.mjs:361 writes `log({ stage: 'auto_deploy_triggered',
      // head: headSha, last_deployed: lastSha })` inside the try/catch at
      // mjs:348-373 that wraps the post-phase auto-deploy hook. This row
      // fires whenever the tick's HEAD short-sha differs from the recorded
      // last-good-build.json sha — which is the common case in the
      // autonomous loop that commits+deploys on every non-idle tick, so
      // coverage-per-guard is high on green-path CI runs. `head` is
      // `spawnSync('git', ['rev-parse', '--short', 'HEAD']).stdout?.trim()
      // ?? ''` (mjs:358-359) — always a string (empty on a repo-less host,
      // otherwise a 7-char short-sha), never null, never absent, never a
      // non-string primitive. `last_deployed` is `lastSha` derived from
      // `(parsed.git_sha || parsed.sha || '').slice(0, 7)` at mjs:355 —
      // always a string (empty when last-good-build.json is missing or
      // malformed, otherwise a 7-char short-sha), never null, never
      // absent, never a non-string primitive. No value pin — the pin
      // tolerates empty-string on repo-less / fresh-host CI environments
      // per tick 230's "assert typeof string only so the value can drift"
      // convention. Two pins in one guard because head + last_deployed
      // share the same conditional at mjs:361 — they always land together
      // on the same row, so the guard cost is amortised (matches ticks
      // 240 + 242 + 244 + 245 two-pin rationale verbatim except for the
      // stage literal + writer source line citations). Comes after the
      // tick 245 human_blocked_snapshot guard so future guards land in
      // monotonic tick-order. Continues the two-pin cadence broken by
      // tick 246's y10 documentation-only pass — one-pin was restored,
      // now stepping back into a two-pin because head + last_deployed
      // are inseparable at the writer site.
      if (tickRow.stage === "auto_deploy_triggered") {
        expect(
          typeof tickRow.head,
          `tick_history auto_deploy_triggered row.head should be typeof string (reseller-goal-loop.mjs:358-359 writes \`spawnSync('git', ['rev-parse', '--short', 'HEAD']).stdout?.trim() ?? ''\` — empty on repo-less host, otherwise 7-char short-sha): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
        expect(
          typeof tickRow.last_deployed,
          `tick_history auto_deploy_triggered row.last_deployed should be typeof string (reseller-goal-loop.mjs:355 writes \`(parsed.git_sha || parsed.sha || '').slice(0, 7)\` — empty when last-good-build.json missing/malformed, otherwise 7-char short-sha): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // tick 248 — auto_deploy_finished stage schema pin (option y15;
      // symmetric two-pin shape matching tick 240's phase_failed guard +
      // tick 242's auto_commit_finished guard + tick 244's error guard +
      // tick 245's human_blocked_snapshot guard + tick 247's
      // auto_deploy_triggered guard). scripts/cron/reseller-goal-loop.mjs:367
      // writes `log({ stage: 'auto_deploy_finished', status: deploy.status ??
      // -1, head: headSha })` inside the else-branch at mjs:360-367 that
      // fires immediately after auto_deploy_triggered whenever headSha !==
      // lastSha — so this row lands together with the tick 247 guard on
      // every non-idle tick where the loop committed new work. Paired
      // writer contract: auto_deploy_triggered emits BEFORE the spawnSync
      // deploy-live.sh call at mjs:362-366, auto_deploy_finished emits
      // AFTER it with the resulting spawn status. Both share the same
      // conditional branch (headSha !== lastSha) so they always land
      // together on the same tick — same coverage-per-guard rationale as
      // tick 245 human_blocked_snapshot (which fires on every tick's
      // happy path). Two pins in one guard because status + head share
      // the same conditional at mjs:367 — they always land together on
      // the same row, so the guard cost is amortised (matches ticks
      // 240 + 242 + 244 + 245 + 247 two-pin rationale verbatim except
      // for the stage literal + writer source line citations). `status`
      // is `deploy.status ?? -1` where `deploy` is the spawnSync return
      // of `bash deploy-live.sh --quick` at mjs:362-366 — `.status` is
      // `number | null` per the Node.js contract, the `?? -1` fallback
      // narrows it to a JSON number every time (0 on green deploy,
      // non-zero on deploy failure, -1 when spawnSync itself fails to
      // launch bash). `head` is the same `headSha` string threaded
      // through from the tick 247 auto_deploy_triggered guard — always
      // a string (empty on repo-less host, otherwise 7-char short-sha
      // from `git rev-parse --short HEAD`). No value pin — `status`
      // drifts with deploy outcome per tick; `head` drifts with git
      // history per tick 230's "assert typeof string only so the value
      // can drift" convention. Continues the two-pin cadence from tick
      // 247 (auto_deploy_triggered) — the auto_deploy_* family cluster
      // now lands three consecutive rows (247 triggered → 248 finished,
      // with 249 slot open for skipped/failed) — coverage-per-guard is
      // maximised by pinning the paired triggered/finished contract
      // together in adjacent ticks rather than fanning across the ~10
      // remaining stages. Comes AFTER the tick 247 auto_deploy_
      // triggered guard so future guards land in monotonic tick-order.
      if (tickRow.stage === "auto_deploy_finished") {
        expect(
          typeof tickRow.status,
          `tick_history auto_deploy_finished row.status should be typeof number (reseller-goal-loop.mjs:367 writes \`deploy.status ?? -1\` from spawnSync bash deploy-live.sh --quick at mjs:362-366): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
        expect(
          typeof tickRow.head,
          `tick_history auto_deploy_finished row.head should be typeof string (reseller-goal-loop.mjs:367 threads the same \`headSha\` from mjs:358-359 as the paired auto_deploy_triggered row): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // tick 249 — auto_deploy_skipped stage schema pin (option y15;
      // two-pin shape preserving the two-pin cadence established by
      // ticks 240 + 242 + 244 + 245 + 247 + 248 rather than the
      // available three-pin ceiling break). scripts/cron/reseller-goal-
      // loop.mjs:369 writes `log({ stage: 'auto_deploy_skipped',
      // reason: 'no new commits', head: headSha, last_deployed: lastSha
      // })` inside the else-branch at mjs:368-370 that fires whenever
      // headSha === lastSha (or headSha is empty on a repo-less host) —
      // the idle-tick counterpart of the tick 247/248 triggered/finished
      // pair. Closes the auto_deploy_* family cluster alongside 247 +
      // 248 so the three writer branches (triggered, finished, skipped)
      // all carry pinned shape guards after this tick, with only
      // auto_deploy_failed (mjs:372, catch branch) remaining for a
      // future tick. Two pins in one guard because reason + head share
      // the same conditional at mjs:369 (else-branch at mjs:368) — they
      // always land together on the same row, so the guard cost is
      // amortised (matches ticks
      // 240 + 242 + 244 + 245 + 247 + 248 two-pin rationale verbatim
      // except for the stage literal + writer source line citations).
      // `reason` is the bare string literal 'no new commits' written
      // directly at mjs:369 — schema-guaranteed to that exact value
      // because it is a compile-time constant with no interpolation, so
      // this is one of the rare stage guards where a value-equality
      // pin is safe (breaks tick 230's "typeof only so value can drift"
      // convention deliberately — the writer literal has no drift
      // surface, unlike deploy.status or headSha). `head` is the same
      // `headSha` string threaded through from the tick 247 + 248
      // guards — always a string (empty on repo-less host, otherwise
      // 7-char short-sha from `git rev-parse --short HEAD`), so the
      // typeof=string pin matches the tick 247 + 248 head convention
      // verbatim. No `last_deployed` pin — dropped to preserve the two-
      // pin cadence, and its shape is already covered by the tick 247
      // auto_deploy_triggered guard (same derivation at mjs:355), so
      // pinning it here would be redundant surface. Coverage-per-guard
      // is high on green-path CI runs when the loop has no new commits
      // between ticks — inverse of the tick 247/248 branch which fires
      // when there ARE new commits, so together the three guards cover
      // the full auto_deploy_* branch matrix. Comes AFTER the tick 248
      // auto_deploy_finished guard so future guards land in monotonic
      // tick-order.
      if (tickRow.stage === "auto_deploy_skipped") {
        expect(
          tickRow.reason,
          `tick_history auto_deploy_skipped row.reason should equal the exact string literal 'no new commits' (reseller-goal-loop.mjs:369 writes it as a compile-time constant with no interpolation, so a value-equality pin is schema-safe): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("no new commits");
        expect(
          typeof tickRow.head,
          `tick_history auto_deploy_skipped row.head should be typeof string (reseller-goal-loop.mjs:369 threads the same \`headSha\` from mjs:358-359 as the tick 247/248 auto_deploy_triggered/finished guards): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // tick 250 — auto_deploy_failed stage schema pin (option y17;
      // one-pin shape matching tick 244's error stage convention).
      // scripts/cron/reseller-goal-loop.mjs:372 writes
      // `log({ stage: 'auto_deploy_failed', error: String(err) })`
      // inside the catch branch at mjs:371-373 that wraps the whole
      // auto-deploy hook (mjs:348-373) — fires only when the
      // last-good-build.json read, the git rev-parse, or the
      // deploy-live.sh --quick spawnSync throws before the else-branch
      // at mjs:368 has a chance to emit auto_deploy_skipped. Closes
      // the auto_deploy_* family cluster completely alongside ticks
      // 247 (triggered) + 248 (finished) + 249 (skipped) — after this
      // tick every writer branch of the mjs:348-373 auto-deploy hook
      // carries a pinned shape guard. One-pin because the writer
      // only emits a single `error` key beyond the stage discriminator
      // (no head, no last_deployed — those are scoped inside the try
      // block above the throw point) and `String(err)` is a value cast
      // with no drift-safe literal to value-pin against, matching tick
      // 244's error stage convention verbatim. TYPEOF pin (not value)
      // because `String(err)` is unbounded — any Node.js Error subclass
      // or string thrown from within the try block reaches here, so
      // the value legitimately drifts per throw-site. Fires only on
      // the catch branch — coverage-per-guard is low on green-path CI
      // runs (the try body is deterministic under normal conditions
      // and the read/spawn/write chain rarely throws) but the pin
      // closes the last writer contract of the auto_deploy_* family
      // so a refactor that renames the error key or drops the
      // String() cast lights up this guard. Comes AFTER the tick 249
      // auto_deploy_skipped guard so future guards land in monotonic
      // tick-order.
      if (tickRow.stage === "auto_deploy_failed") {
        expect(
          typeof tickRow.error,
          `tick_history auto_deploy_failed row.error should be typeof string (reseller-goal-loop.mjs:372 writes \`String(err)\` from the catch branch wrapping the mjs:348-373 auto-deploy hook — any Node.js Error subclass or string thrown from the try body is coerced via String() so the value legitimately drifts per throw-site but the type is invariant): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
      }
      // tick 251 — phase_dispatched stage schema pin (option y16;
      // symmetric two-pin shape matching tick 240's phase_failed guard
      // verbatim except for the stage literal — phase_dispatched is
      // the paired success-path writer contract of phase_failed).
      // scripts/cron/reseller-goal-loop.mjs:299 writes
      // `log({ stage: 'phase_dispatched', ...result })` inside the
      // per-frontier-entry loop at mjs:296-304 where `result` is the
      // return value of dispatchToClaude() at mjs:190-205 which
      // constructs `{ status: res.status ?? -1, elapsed_ms, signal,
      // label }`. Unlike phase_failed (which only fires when
      // result.status !== 0), phase_dispatched fires on EVERY frontier
      // entry the loop dispatches — the tick 240 guard only lights up
      // on subprocess-failure branches, but this guard lights up on
      // every green-path CI run that has any unblocked frontier at
      // all, giving it much higher coverage-per-guard than tick 240.
      // `label` is threaded in at mjs:298 as `${entry.track}:${entry.
      // phase}` — a template literal over string keys from
      // computeFrontier() (mjs:147: `frontier.push({ track: t, phase:
      // name, ... })` where t/name come from Object.keys(goal.tracks)
      // + Object.entries(...phases)), so it is a schema-level
      // typeof=string guarantee. `status` is `res.status ?? -1` where
      // `res` is the spawnSync result — `.status` is `number | null`
      // and the ?? -1 fallback narrows it to a JSON number every time.
      // Two pins in one guard because label + status share the same
      // conditional at mjs:299 — they always land together on the
      // same row, so the guard cost is amortised (matches ticks
      // 240 + 242 + 244 + 245 + 247 + 248 two-pin rationale verbatim
      // except for the stage literal + writer source line citations).
      // Dropped `elapsed_ms` + `signal` from this two-pin pass to
      // preserve the two-pin cadence: elapsed_ms is typeof=number
      // (Date.now() - started at mjs:203, always a finite integer,
      // never null); signal is `string | null` on the Node.js
      // spawnSync contract (null on clean exit, string on kill signal
      // like 'SIGTERM'), so it needs a nullable typeof guard rather
      // than a bare typeof=string pin — deferred to a future tick as
      // a paired two-pin (elapsed_ms + signal) landing that closes
      // the dispatchToClaude() writer contract completely. Fires on
      // every non-idle tick where the loop has an unblocked frontier
      // (i.e. the common case in autonomous CI runs), so this is one
      // of the highest-coverage guards in the file — inverse of the
      // tick 240 phase_failed guard which is one of the lowest (only
      // subprocess-failure branches). Comes AFTER the tick 250
      // auto_deploy_failed guard so future guards land in monotonic
      // tick-order.
      if (tickRow.stage === "phase_dispatched") {
        expect(
          typeof tickRow.label,
          `tick_history phase_dispatched row.label should be typeof string (reseller-goal-loop.mjs:298 threads \`\${entry.track}:\${entry.phase}\` through dispatchToClaude → mjs:299 spread): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("string");
        expect(
          typeof tickRow.status,
          `tick_history phase_dispatched row.status should be typeof number (reseller-goal-loop.mjs:204 dispatchToClaude returns \`res.status ?? -1\` → mjs:299 spread): ${JSON.stringify(row).slice(0, 200)}`,
        ).toBe("number");
      }
    }
    expect(
      typeof body.generated_at === "string" &&
        ISO_RE.test(body.generated_at as string),
      `happy body.generated_at should be ISO-8601 string: ${JSON.stringify(body).slice(0, 200)}`,
    ).toBe(true);
  });
});
