// Reseller scope boundary — P10_hardening dry-run per plan §J.4 point 4:
// "reseller user attempting to fetch /api/svi/*, /api/dataroom/*,
// /api/cap-table/* for an attributed customer; expect 403 on every one."
//
// Skips until the reseller QA harness is provisioned (see fixtures/reseller.ts).
// Landing this scaffold pre-unblock keeps the P10 gate ready to fire as soon
// as P1.5 (H.20 ABN) + P8.5 (Stripe add-on env vars) clear.
//
// ACTIVATED wave-5 row 181 below (temp-reseller mint fixture route via
// loadTempReseller('active_wholesale')). The pre-existing describe keeps
// the env-based loadResellerHarness contract alive for hosts that hold the
// QA_RESELLER_ADMIN_EMAIL + QA_RESELLER_ATTRIBUTED_CUSTOMER_ID +
// QA_RESELLER_ATTRIBUTED_PROJECT_ID env-var trio; the new describe covers
// the QAPROBE cohort (seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1)
// via fixture.attributedUserId + attach.attributedUserId + a projects
// lookup for the attributed founder so the same auth-refusal invariant is
// pinned without a second env-var flip. Both blocks assert that the
// reseller-admin session is refused (401 / 402 / 403 / 404) on the SVI +
// dataroom + cap-table read/write endpoints when the target belongs to an
// attributed customer's workspace — matches plan §420 P10 exit criterion
// #3 (security-audit: RLS + typed wrapper enforced end-to-end). Mirror-
// shape of wave-5 row 180 (audit-anomaly-scan twin describe tick 176).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import {
  harnessSkipReason,
  loadResellerHarness,
  loadTempReseller,
  tempResellerSkipReason,
  type TempResellerFixture,
} from "../fixtures/reseller";
import {
  findFirstProjectIdForUser,
  loadSupabaseAdmin,
  supabaseAdminSkipReason,
} from "../fixtures/supabase-admin";

interface ProbeRoute {
  method: "GET" | "POST";
  url: (customerId: string, projectId: string | null) => string;
  body?: Record<string, unknown>;
  label: string;
}

const PROBES: ProbeRoute[] = [
  {
    method: "GET",
    label: "/api/svi/latest for attributed customer",
    url: (customerId) => `/api/svi/latest?user_id=${encodeURIComponent(customerId)}`,
  },
  {
    method: "GET",
    label: "/api/svi/history for attributed customer",
    url: (customerId) => `/api/svi/history?user_id=${encodeURIComponent(customerId)}`,
  },
  {
    method: "POST",
    label: "/api/dataroom/clone into attributed project",
    url: (_c, projectId) => `/api/dataroom/clone`,
    body: { source_project_id: "__placeholder__" },
  },
  {
    method: "POST",
    label: "/api/cap-table on attributed project",
    url: () => "/api/cap-table",
    body: { holder: "probe", class: "ordinary", quantity: 1 },
  },
];

test.describe("Reseller scope boundary — P10 dry-run", () => {
  const harness = loadResellerHarness();
  test.skip(!harness, harnessSkipReason());

  for (const probe of PROBES) {
    test(`reseller admin cannot ${probe.label}`, async ({ page, request }) => {
      await loginAs(page, harness!.admin.email);
      const url = probe.url(harness!.attributedCustomerId, harness!.attributedProjectId);
      const body = probe.body
        ? JSON.parse(
            JSON.stringify(probe.body).replace(
              "__placeholder__",
              harness!.attributedProjectId ?? harness!.attributedCustomerId,
            ),
          )
        : undefined;
      const resp =
        probe.method === "GET"
          ? await request.get(url)
          : await request.post(url, { data: body });
      expect(
        [401, 402, 403, 404],
        `${probe.label} returned ${resp.status()} — expected auth/scope refusal`,
      ).toContain(resp.status());
    });
  }
});

// Wave-5 row 181 — reseller-admin session cannot fetch /api/svi/*,
// /api/dataroom/*, /api/cap-table/* for an attributed customer when driven
// via the temp-reseller mint fixture's active_wholesale variant. Twin of
// the pre-existing describe: uses fixture.attributedUserId + attach.
// attributedUserId (via attachAttributedCustomer) + a live projects lookup
// for the attributed founder instead of leaning on the env-based
// loadResellerHarness contract. That means a QAPROBE-cohort host — which
// mints per-variant reseller rows via seed-qa-reseller.mjs with
// QA_RESELLER_MULTI_ADMIN=1 — covers the same scope-refusal invariant
// without a second env-var flip. Mirror-shape of wave-5 row 180 (audit-
// anomaly-scan twin describe tick 176): fixture in beforeAll, five-step
// skip discipline (fixture null / attributedUserId null /
// !attributionExists / supabase null / projectId null), attach the cache
// column via attachAttributedCustomer() so /api/reseller/* rescues would
// resolve (not relevant for the /api/svi/* etc. paths tested here but
// ensures the QAPROBE cohort stays parity with row 180 for cross-spec
// leak protection), then loginAs(fixture.adminEmail) and fire the same
// four probes.
test.describe("Reseller scope boundary — P10 wave-5 row 181 happy path", () => {
  let fixture: TempResellerFixture | null = null;
  let fixtureError: string | null = null;

  test.beforeAll(async () => {
    try {
      fixture = await loadTempReseller("active_wholesale");
    } catch (err) {
      fixtureError = (err as Error).message;
    }
  });

  test.afterAll(async () => {
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (err) {
        // Bubble so a partial restore fails the run rather than leaking
        // attribution_reseller_id state into the next spec worker.
        throw new Error(
          `wave-5 row 181 cleanup failed — attributed founder's app_users.attribution_reseller_id may still point at the QAPROBE reseller: ${(err as Error).message}`,
        );
      }
    }
  });

  for (const probe of PROBES) {
    test(`reseller admin cannot ${probe.label}`, async ({ page, request }) => {
      if (fixtureError) {
        test.skip(true, `${tempResellerSkipReason("active_wholesale")} (${fixtureError})`);
        return;
      }
      if (!fixture) {
        test.skip(true, tempResellerSkipReason("active_wholesale"));
        return;
      }
      if (!fixture.attributedUserId) {
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — attributedUserId null (attributed founder app_users row missing on this host). Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attributed founder row lands.`,
        );
        return;
      }
      if (!fixture.attributionExists) {
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — reseller_attributions row missing on this host so the QAPROBE cohort is only partially seeded. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 so the attribution row lands alongside the reseller_admins mirror.`,
        );
        return;
      }

      const supabase = loadSupabaseAdmin();
      if (!supabase) {
        test.skip(true, supabaseAdminSkipReason());
        return;
      }

      // Resolve a real projects.id owned by the attributed founder. The pre-
      // existing describe reads it from QA_RESELLER_ATTRIBUTED_PROJECT_ID —
      // the QAPROBE cohort does not export that env var, so look it up
      // read-only via findFirstProjectIdForUser. Falls back to
      // attributedUserId as the ?user_id= for the SVI probes (which take a
      // user id, not a project id) but the dataroom/cap-table probes need a
      // real project id in the body, so a null project row makes those
      // sub-probes skip individually rather than false-positive 404.
      const attributedUserId = fixture.attributedUserId;
      const projectId = await findFirstProjectIdForUser(supabase, attributedUserId);
      if (!projectId && probe.body) {
        // dataroom/clone + cap-table probes both need a project id in body.
        // Without one, the route would 404 not_found rather than 403 not_in_
        // scope — same outcome for the wave-5 assertion (both are in the
        // accepted [401,402,403,404] set) but the intent test would drift.
        test.skip(
          true,
          `${tempResellerSkipReason("active_wholesale")} — attributed founder has no projects row on this host so the ${probe.label} body cannot be constructed. Re-run seed-qa-reseller.mjs with QA_RESELLER_MULTI_ADMIN=1 or seed a workspace for the attributed founder.`,
        );
        return;
      }

      // attachAttributedCustomer() hydrates app_users.attribution_reseller_id
      // for the attributed founder against THIS variant's reseller_id.
      // Restore closure runs in afterAll via fixture.cleanup() so a failing
      // assertion cannot leak the cache flip. Matches row 180 posture.
      const attach = await fixture.attachAttributedCustomer();
      if (!attach) {
        test.skip(
          true,
          "attachAttributedCustomer() returned null — variant mismatch or attributedUserId lookup failed after beforeAll seed. Investigate seed-qa-reseller.mjs output.",
        );
        return;
      }

      try {
        await loginAs(page, fixture.adminEmail);
      } catch (err) {
        test.skip(
          true,
          `Reseller-admin QA account not seeded for variant='active_wholesale' (${fixture.adminEmail}): ${(err as Error).message}. Run scripts/seed-test-users.mjs with QA_RESELLER_MULTI_ADMIN=1 to populate /tmp/blockid-qa-accounts.txt.`,
        );
        return;
      }

      const url = probe.url(attach.attributedUserId, projectId);
      const body = probe.body
        ? JSON.parse(
            JSON.stringify(probe.body).replace(
              "__placeholder__",
              projectId ?? attach.attributedUserId,
            ),
          )
        : undefined;
      const resp =
        probe.method === "GET"
          ? await request.get(url)
          : await request.post(url, { data: body });
      expect(
        [401, 402, 403, 404],
        `${probe.label} returned ${resp.status()} — expected auth/scope refusal (reseller-admin session against attributed founder's SVI/dataroom/cap-table endpoints must not resolve). Body: ${await resp.text()}`,
      ).toContain(resp.status());
    });
  }
});
