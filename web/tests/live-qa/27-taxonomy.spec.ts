/**
 * 27 — Founder taxonomy confirmation (G13-W4-D2 E1.4, BA spec §B.6 / T1):
 * `/workspace/settings/project` renders the confirmation card for the QA
 * project (owner role), GET /api/projects/[id]/taxonomy answers for the
 * member, PATCH with a bad enum is a 400 with issue paths, and a real
 * "Not sure" + confirm round-trip sets `confirmed_at`, turns sources into
 * `founder` and leaves industry `unclassified` (never "Other"). Runs on the
 * founder lane only — the suite seeds no evaluator seat, so the dossier
 * assessment form (S-D2 evaluator lane) is not exercised here.
 *
 * Idempotent: the QA project is erased by the global teardown; the taxonomy
 * row cascades with it (0394 FK).
 */
import { test, expect } from "./fixtures";
import { evidence, get, patch } from "./lib/api";

interface TaxonomyBody {
  ok: boolean;
  taxonomy: { industry: string; business_model: string; sources: Record<string, unknown>; confirmed_at: string | null; confirmed_by: string | null } | null;
  confirmed: boolean;
  unclassified_count: number;
  changed?: string[];
  issues?: Array<{ path: string; message: string }>;
  error?: string;
}

test.describe("Founder taxonomy confirmation", () => {
  test("/workspace/settings/project shows the confirmation card for the active project", async ({ page, visit, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in run state");
    await visit("/workspace/settings/project");
    await expect(page.getByRole("heading", { level: 1, name: /Project settings/ })).toBeVisible({ timeout: 30_000 });
    const card = page.getByTestId("taxonomy-confirm-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/How we classify/);
    const mode = await card.getAttribute("data-mode");
    const confirmed = await card.getAttribute("data-confirmed");
    await evidence(testInfo, "taxonomy card", { mode, confirmed });
    // Either the summary ("Correct?" + Confirm) or the DQ-1 form ("pick one").
    if (mode === "summary") {
      await expect(card.getByTestId("taxonomy-edit")).toBeVisible();
    } else {
      await expect(card.getByTestId("taxonomy-form")).toBeVisible();
      await expect(card.locator("#tax-industry")).toBeVisible();
    }
  });

  test("GET taxonomy for the member; PATCH bad enum → 400 with issue paths; Not sure + confirm round-trip", async ({ api, qa }, testInfo) => {
    test.skip(!qa.projectId, "no QA project id in run state");
    const id = qa.projectId!;
    const before = await get<TaxonomyBody>(api, `/api/projects/${id}/taxonomy`);
    await evidence(testInfo, "GET taxonomy (before)", before.body);
    expect(before.status).toBe(200);
    expect(before.body.ok).toBe(true);

    const bad = await patch<TaxonomyBody>(api, `/api/projects/${id}/taxonomy`, { industry: "crypto", confirm: true });
    await evidence(testInfo, "PATCH bad enum", bad.body);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_body");
    expect(bad.body.issues?.map((i) => i.path)).toContain("industry");

    const confirmed = await patch<TaxonomyBody>(api, `/api/projects/${id}/taxonomy`, {
      not_sure: ["industry"],
      business_model: "saas_subscription",
      customer_types: ["b2b"],
      confirm: true,
    });
    await evidence(testInfo, "PATCH not_sure + confirm", confirmed.body);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.ok).toBe(true);
    expect(confirmed.body.taxonomy?.industry).toBe("unclassified");
    expect(confirmed.body.taxonomy?.business_model).toBe("saas_subscription");
    expect(confirmed.body.taxonomy?.confirmed_at).toBeTruthy();
    expect(confirmed.body.taxonomy?.sources.industry).toBe("founder");
    expect(confirmed.body.taxonomy?.sources.business_model).toBe("founder");

    const after = await get<TaxonomyBody>(api, `/api/projects/${id}/taxonomy`);
    expect(after.body.confirmed).toBe(true);
    expect(after.body.unclassified_count).toBe(1);

    // An unknown project id must not confirm existence (404, never 403).
    const stranger = await get<TaxonomyBody>(api, "/api/projects/00000000-0000-4000-8000-000000000000/taxonomy");
    expect(stranger.status).toBe(404);
  });
});
