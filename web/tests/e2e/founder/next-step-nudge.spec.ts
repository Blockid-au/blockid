// Founder nudge — GET /api/nudge/next-steps happy path + shape pin.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §3.
//
// Strategy: use the shared loginAs() fixture (seeds a QA founder
// deterministically via /api/qa/login or the public sign-in form). If
// the fixture cannot be loaded (fresh dev machine without
// /tmp/blockid-qa-accounts.txt), we skip at test-scope.
//
// The default QA founder (qa-founder-1@blockid.au) may or may not be at
// phase 6 depending on prior seeding, so the shape assertion accepts
// any 1..12 phase and only tightens on the invariants the engine
// guarantees for every founder:
//
//   1. current_phase.slug is a string decimal in 1..12
//   2. next_action has {title, cta_url, cta_label, category}
//   3. missing is an array (may be empty for fresh accounts)
//   4. readiness_score.overall is a finite number in 0..100
//   5. Meta payload carries the AFSL disclaimer required by
//      docs/plans/atlassian-standard-mapping-goal.md §3.7.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

const ROUTE = "/api/nudge/next-steps";
const FOUNDER_EMAIL =
  process.env.QA_FOUNDER_NUDGE_EMAIL ?? "qa-founder-1@blockid.au";

const CATEGORY_ENUM = new Set([
  "dataroom",
  "svi_evidence",
  "phase_advance",
  "compliance",
]);

const CONFIDENCE_ENUM = new Set(["high", "medium", "low"]);

test.describe("Founder nudge — /api/nudge/next-steps", () => {
  test.setTimeout(30_000);

  test("401 for anonymous callers", async ({ request }) => {
    const res = await request.get(ROUTE);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false });
  });

  test("returns a well-formed nudge for a logged-in founder", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      // fall through — fixture missing.
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    const res = await page.request.get(ROUTE);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // ── Envelope ────────────────────────────────────────────────────
    expect(body.ok).toBe(true);
    expect(body.result).toBeTruthy();
    expect(body.meta).toBeTruthy();

    const { result, meta } = body;

    // ── Current phase (1..12) ───────────────────────────────────────
    expect(typeof result.current_phase.slug).toBe("string");
    const phaseNum = Number.parseInt(result.current_phase.slug, 10);
    expect(Number.isInteger(phaseNum)).toBe(true);
    expect(phaseNum).toBeGreaterThanOrEqual(1);
    expect(phaseNum).toBeLessThanOrEqual(12);
    expect(typeof result.current_phase.label).toBe("string");
    expect(typeof result.current_phase.canonical_stage).toBe("string");

    // ── Next action ────────────────────────────────────────────────
    expect(typeof result.next_action.title).toBe("string");
    expect(typeof result.next_action.cta_url).toBe("string");
    expect(result.next_action.cta_url.startsWith("/")).toBe(true);
    expect(typeof result.next_action.cta_label).toBe("string");
    expect(CATEGORY_ENUM.has(result.next_action.category)).toBe(true);

    // ── Missing (array; each row shape-pinned) ─────────────────────
    expect(Array.isArray(result.missing)).toBe(true);
    expect(result.missing.length).toBeLessThanOrEqual(5);
    for (const item of result.missing) {
      expect(typeof item.category).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.phase_slug).toBe("string");
      expect(typeof item.raise_blocker).toBe("boolean");
      expect(typeof item.cta_url).toBe("string");
    }

    // ── Readiness score in 0..100 ──────────────────────────────────
    const overall = result.readiness_score.overall;
    expect(Number.isFinite(overall)).toBe(true);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
    for (const key of [
      "market",
      "team",
      "tech",
      "financial",
      "compliance",
    ] as const) {
      const v = result.readiness_score.sub_scores[key];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }

    // ── Reason + confidence ────────────────────────────────────────
    expect(typeof result.nudge_reason).toBe("string");
    expect(result.nudge_reason.length).toBeGreaterThan(0);
    expect(CONFIDENCE_ENUM.has(result.next_step_confidence)).toBe(true);

    // ── AFSL disclaimer present in meta ────────────────────────────
    expect(typeof meta.afsl_disclaimer).toBe("string");
    expect(meta.afsl_disclaimer.toLowerCase()).toContain("s766b");
  });

  test("behaviour rule — a founder in phase >= 6 surfaces a raise-blocker or compliance item", async ({
    page,
  }) => {
    let loginOk = false;
    try {
      await loginAs(page, FOUNDER_EMAIL);
      loginOk = true;
    } catch {
      // fall through
    }
    test.skip(
      !loginOk,
      `QA founder ${FOUNDER_EMAIL} not seeded — run scripts/seed-test-users.mjs`,
    );

    const res = await page.request.get(ROUTE);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.result;
    const phaseNum = Number.parseInt(result.current_phase.slug, 10);

    // Only assert the behavioural invariant when the seeded fixture
    // actually sits at Phase 6 or later — earlier phases are legitimate
    // for founders who have not filled anything in yet.
    test.skip(
      phaseNum < 6,
      `founder currently at phase ${phaseNum} — behavioural rule scoped to phase >= 6`,
    );

    const hasFinancialOrCompliance = result.missing.some(
      (m: { category: string }) =>
        /Financial|Compliance|Tax|IP|Corporate/i.test(m.category),
    );
    expect(hasFinancialOrCompliance).toBe(true);
  });
});
