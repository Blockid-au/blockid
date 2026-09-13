// Colocated suite for the listing readiness server assembly (S29-A):
// bank-line profit (12-month coverage rule, revenue − expense kinds only,
// grants / neutral excluded, trailing window), holders keyed on the OWNER
// and filtered to the project, profile normalisation, the one-off PDF
// charge stamp, and the company block (founder's entity, formatted ABN /
// ACN).

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/share-price-server", () => ({ loadSharePriceMidForScope: async () => 1.25 }));

import { bankProfitFromLines, formatAbn, formatAcn, loadHoldersForScope, loadListingFactsForScope, loadListingProfile, markListingPdfCharged, saveListingFacts } from "./server";

const scope = { projectId: "proj-1", ownerUserId: "user-owner", dataEmail: "owner@x.test", project: { name: "Acme Robotics Pty Ltd" } };

describe("bankProfitFromLines", () => {
  it("null under 12 months of coverage; coverage counts whole months inclusive", () => {
    expect(bankProfitFromLines([])).toEqual({ profitLast12mAud: null, coverageMonths: 0 });
    const eleven = [
      { occurred_on: "2025-10-01", amount_aud: 100, category: "revenue" },
      { occurred_on: "2026-08-31", amount_aud: 100, category: "revenue" },
    ];
    expect(bankProfitFromLines(eleven)).toEqual({ profitLast12mAud: null, coverageMonths: 11 });
  });

  it("revenue − expense kinds over the trailing 12 months; grants, transfers and drawings ignored; older lines dropped", () => {
    const lines = [
      { occurred_on: "2025-07-15", amount_aud: 50_000, category: "revenue" }, // outside the trailing window (Sep 2025 – Aug 2026)
      { occurred_on: "2025-09-01", amount_aud: 20_000, category: "revenue" },
      { occurred_on: "2026-03-01", amount_aud: "30000.50", category: "revenue" },
      { occurred_on: "2026-04-01", amount_aud: -4_000, category: "salaries_wages" },
      { occurred_on: "2026-05-01", amount_aud: -1_000.25, category: "cloud_hosting" },
      { occurred_on: "2026-06-01", amount_aud: 100_000, category: "government_grants" },
      { occurred_on: "2026-07-01", amount_aud: -9_999, category: "transfer" },
      { occurred_on: "2026-07-02", amount_aud: 5_000, category: "owner_drawings" },
      { occurred_on: "2026-08-31", amount_aud: -500, category: "other" },
    ];
    expect(bankProfitFromLines(lines)).toEqual({ profitLast12mAud: 44_500.25, coverageMonths: 14 });
  });
});

describe("loaders", () => {
  it("holders: owner's cap table, rows of another project dropped, legacy null project kept", async () => {
    const sb = fakeSupabase({
      shareholders: [
        { id: "a", account_id: "user-owner", project_id: "proj-1", name: "Jane", role: "founder", shares_held: "600000" },
        { id: "b", account_id: "user-owner", project_id: null, name: "Seed", role: "investor", shares_held: 400000 },
        { id: "c", account_id: "user-owner", project_id: "proj-2", name: "Other", role: "investor", shares_held: 1 },
      ],
    });
    const holders = await loadHoldersForScope(sb as never, scope);
    expect(holders).toEqual([
      { id: "a", name: "Jane", role: "founder", sharesHeld: 600_000 },
      { id: "b", name: "Seed", role: "investor", sharesHeld: 400_000 },
    ]);
    expect(sb.hasEq("shareholders", "account_id", "user-owner")).toBe(true);
  });

  it("profile: absent → empty facts; stored blob normalised; save merges and clears; pdf stamp upserts", async () => {
    const empty = fakeSupabase({ listing_profiles: [] });
    expect(await loadListingProfile(empty as never, "proj-1")).toEqual({ facts: {}, pdfCreditsCharged: 0, pdfChargedAt: null, updatedAt: null });

    const sb = fakeSupabase({ listing_profiles: [{ project_id: "proj-1", facts: { market_makers: 3, junk: 1, directors_total: "x" }, pdf_credits_charged: "1.00", pdf_charged_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }] });
    expect(await loadListingProfile(sb as never, "proj-1")).toEqual({ facts: { market_makers: 3 }, pdfCreditsCharged: 1, pdfChargedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" });

    const next = await saveListingFacts(sb as never, "proj-1", { directors_total: 5 }, ["market_makers"]);
    expect(next).toEqual({ directors_total: 5 });
    const upsert = sb.find("listing_profiles", "upsert");
    expect(upsert).toHaveLength(1);
    expect(upsert[0].args[0]).toMatchObject({ project_id: "proj-1", facts: { directors_total: 5 } });
    expect(upsert[0].args[1]).toEqual({ onConflict: "project_id" });

    expect(await markListingPdfCharged(sb as never, "proj-1", 1)).toBe(true);
    expect(sb.find("listing_profiles", "upsert")[1].args[0]).toMatchObject({ project_id: "proj-1", pdf_credits_charged: 1 });
  });

  it("assembly: share price, bank profit, grant profile (incorporation, listed, ABN/ACN formatted) and the founder's company block", async () => {
    const sb = fakeSupabase({
      shareholders: [{ id: "a", account_id: "user-owner", project_id: "proj-1", name: "Jane", role: "founder", shares_held: 1 }],
      bank_transactions: [],
      project_grant_profiles: [{ project_id: "proj-1", incorporated_at: "2021-03-01", listed: false, abn: "12345678901", acn: "123456789", city: "Sydney", state: "NSW" }],
      listing_profiles: [{ project_id: "proj-1", facts: { aud_usd_rate: 0.65 }, pdf_credits_charged: 0, pdf_charged_at: null, updated_at: null }],
    });
    const out = await loadListingFactsForScope(sb as never, scope, { email: "caller@x.test" });
    expect(out.facts).toEqual({
      holders: [{ id: "a", name: "Jane", role: "founder", sharesHeld: 1 }],
      sharePriceAud: 1.25,
      profitLast12mAud: null,
      profitCoverageMonths: 0,
      incorporatedAt: "2021-03-01",
      listed: false,
      profile: { aud_usd_rate: 0.65 },
    });
    expect(out.company).toEqual({ name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" });
    expect(sb.hasEq("bank_transactions", "project_id", "proj-1")).toBe(true);
  });

  it("formatAbn / formatAcn", () => {
    expect(formatAbn("12 345 678 901")).toBe("12 345 678 901");
    expect(formatAbn("123")).toBeNull();
    expect(formatAcn("123-456-789")).toBe("123 456 789");
    expect(formatAcn(null)).toBeNull();
  });
});
