// Reseller scope boundary — P10_hardening dry-run per plan §J.4 point 4:
// "reseller user attempting to fetch /api/svi/*, /api/dataroom/*,
// /api/cap-table/* for an attributed customer; expect 403 on every one."
//
// Skips until the reseller QA harness is provisioned (see fixtures/reseller.ts).
// Landing this scaffold pre-unblock keeps the P10 gate ready to fire as soon
// as P1.5 (H.20 ABN) + P8.5 (Stripe add-on env vars) clear.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/accounts";
import { harnessSkipReason, loadResellerHarness } from "../fixtures/reseller";

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
