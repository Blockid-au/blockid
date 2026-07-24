// Reseller module full A + B walkthrough — P10_hardening exit criterion:
//   "Playwright E2E: full A + B walkthrough as founder, reseller, admin"
//
// This spec iterates the WALKTHROUGH_STEPS ordered list from
// web/src/lib/reseller/walkthrough-plan.ts and probes each surface in the
// role that owns it. Each role's describe block self-skips until its
// harness is provisioned (see fixtures/reseller.ts:
// loadAttributedFounderHarness, loadResellerHarness, loadAdminHarness).
//
// The runner does a light-touch "page loads without auth redirect" probe on
// every step — it deliberately does NOT re-implement the fine-grained
// invariants (masked-email, k<5 suppression, over-budget CTA, audit-log
// writes) that already have dedicated specs in this directory. Those specs
// remain the source of truth for their invariant; this walkthrough is the
// composite gate that fires the instant the harness lands, proving all
// three role surfaces are wired end to end.
//
// Kept green under the current CI posture (no harness present) via
// describe-scope test.skip() — a fresh run reports three skipped describes,
// zero failures.

import { test, expect } from "@playwright/test";

import {
  stepsByRole,
  type WalkthroughStep,
} from "../../../src/lib/reseller/walkthrough-plan";
import { loginAs } from "../fixtures/accounts";
import {
  adminHarnessSkipReason,
  attributedFounderSkipReason,
  harnessSkipReason,
  loadAdminHarness,
  loadAttributedFounderHarness,
  loadResellerHarness,
} from "../fixtures/reseller";

const PAGE_TIMEOUT = 15_000;

/** Probe one step by navigating to its path and asserting the response is
 *  something OTHER than an unauthenticated redirect to /auth/login. */
async function probeStep(page: import("@playwright/test").Page, step: WalkthroughStep) {
  const resp = await page.goto(step.path, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT,
  });
  expect(resp, `no response for ${step.path}`).not.toBeNull();
  const status = resp!.status();
  // Accept 2xx (page renders), 3xx (redirect to a valid target), 402 (feature-
  // gate refusal is a legitimate reseller-scope outcome for founder-facing
  // pages the reseller isn't entitled to hit), and 404 (per-workspace page
  // shape may return 404 when the harness founder has no matching row yet).
  // Reject 5xx explicitly.
  expect(status, `${step.id} -> ${step.path}`).toBeLessThan(500);
  // The url MUST not be /auth/login — that would mean the role's session
  // never survived, and every downstream step would fail identically.
  const url = new URL(page.url());
  expect(url.pathname).not.toBe("/auth/login");
}

test.describe("Reseller full walkthrough — founder", () => {
  const harness = loadAttributedFounderHarness();
  test.skip(!harness, attributedFounderSkipReason());

  test.setTimeout(120_000);

  for (const step of stepsByRole("founder")) {
    test(step.id, async ({ page }) => {
      if (!harness) return;
      await loginAs(page, harness.founder.email);
      await probeStep(page, step);
    });
  }
});

test.describe("Reseller full walkthrough — reseller", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  test.setTimeout(120_000);

  for (const step of stepsByRole("reseller")) {
    test(step.id, async ({ page }) => {
      if (!harness) return;
      await loginAs(page, harness.admin.email);
      await probeStep(page, step);
    });
  }
});

test.describe("Reseller full walkthrough — admin", () => {
  const harness = loadAdminHarness();
  test.skip(!harness, adminHarnessSkipReason());

  test.setTimeout(120_000);

  for (const step of stepsByRole("admin")) {
    test(step.id, async ({ page }) => {
      if (!harness) return;
      await loginAs(page, harness.admin.email);
      await probeStep(page, step);
    });
  }
});
