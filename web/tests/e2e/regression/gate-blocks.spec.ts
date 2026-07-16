/**
 * Regression — feature gates.
 *
 * As a free (unauthenticated OR free-plan) user, try to hit each gated
 * route directly. Assert:
 *   - HTTP 200 with redirect surface (or 302 → /pricing?feature=…).
 *   - Upgrade prompt / upsell modal visible.
 *   - feature_gate_hit analytics event was recorded.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";

// Routes → capability they require (must match src/lib/entitlements.ts).
const GATED_ROUTES: Array<{ path: string; feature: string }> = [
  { path: "/workspace/cap-table", feature: "cap_table.write" },
  { path: "/workspace/esop", feature: "esop.manage" },
  { path: "/workspace/dividends", feature: "dividends.declare" },
  { path: "/workspace/data-room", feature: "data_room.access" },
  { path: "/workspace/tokenization", feature: "tokenization.deploy" },
  { path: "/workspace/diligence", feature: "diligence.view" },
];

test.describe("Regression — gate blocks", () => {
  for (const { path, feature } of GATED_ROUTES) {
    test(`free user hitting ${path} sees /pricing upsell for ${feature}`, async ({ page, request }) => {
      // Log in as a low-tier account (starter) so `can()` returns false for
      // capabilities that require growth+.
      await loginAs(page, "qa-founder-3@blockid.au"); // trial_expired starter shell

      const resp = await page.goto(path);
      expect(resp?.status()).toBeLessThan(500);

      // Either redirected to /pricing?feature=… or served upsell in-place.
      const url = new URL(page.url());
      if (url.pathname === "/pricing") {
        expect(url.searchParams.get("feature")).toBe(feature);
      } else {
        await expect(page.getByText(/upgrade|not included/i)).toBeVisible();
      }

      // Analytics event must have been recorded.
      const events = await request.get(
        `/api/qa/analytics/events?name=feature_gate_hit&feature=${encodeURIComponent(feature)}`,
      );
      expect(events.ok()).toBeTruthy();
      const list = (await events.json()) as unknown[];
      expect(list.length).toBeGreaterThan(0);
    });
  }
});
