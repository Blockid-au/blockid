// Pure-helper coverage for rofr-workflow.ts. Contract:
// docs/plans/atlassian-standard-mapping-goal.md §1 phase 10 P1 gap
// ("ROFR workflow for secondaries").
//
// Anchors: Corporations Act 2001 (Cth) s707 on-sale rule + Blackbird / AirTree
// / Square Peg standard SHA pre-emption template.

import { describe, it, expect } from "vitest";
import {
  ROFR_DEFAULT_NOTICE_DAYS,
  ROFR_DISCLAIMER,
  TAG_ALONG_FOUNDER_BLOCK_PCT,
  assessRofrWorkflow,
  type CapTableHolder,
  type RofrProposedTransfer,
  type RofrWorkflowInput,
} from "./rofr-workflow";

const NOW = new Date("2026-07-24T00:00:00Z");

const FOUNDER_A: CapTableHolder = {
  holder_id: "founder-a",
  name: "Alice Founder",
  held_shares: 4000,
  is_founder: true,
};
const FOUNDER_B: CapTableHolder = {
  holder_id: "founder-b",
  name: "Bob Founder",
  held_shares: 4000,
  is_founder: true,
};
const ANGEL: CapTableHolder = {
  holder_id: "angel-1",
  name: "Angel Investor",
  held_shares: 2000,
};

function transfer(
  overrides: Partial<RofrProposedTransfer> = {},
): RofrProposedTransfer {
  return {
    seller_id: "founder-a",
    buyer_name: "Acme Capital",
    share_count: 1000,
    price_per_share_aud: 5,
    notice_date_iso: "2026-07-01",
    ...overrides,
  };
}

function input(
  overrides: Partial<RofrWorkflowInput> = {},
): RofrWorkflowInput {
  return {
    cap_table: [FOUNDER_A, FOUNDER_B, ANGEL],
    proposed_transfer: transfer(),
    now: NOW,
    ...overrides,
  };
}

describe("assessRofrWorkflow — pro-rata entitlement", () => {
  it("splits the transfer pro-rata across pre-emption holders (excluding seller)", () => {
    const r = assessRofrWorkflow(input());
    expect(r.eligible_holders).toHaveLength(2);
    const bob = r.eligible_holders.find((h) => h.holder_id === "founder-b")!;
    const angel = r.eligible_holders.find((h) => h.holder_id === "angel-1")!;
    // Non-seller pool = 4000 + 2000 = 6000 → bob gets 4000/6000 × 1000 = 667, angel 333.
    expect(bob.entitled_shares).toBe(667);
    expect(angel.entitled_shares).toBe(333);
    expect(r.disclaimer).toBe(ROFR_DISCLAIMER);
  });

  it("excludes holders with pre_emption_right=false", () => {
    const noPreEmpt = {
      ...ANGEL,
      pre_emption_right: false,
    };
    const r = assessRofrWorkflow(
      input({ cap_table: [FOUNDER_A, FOUNDER_B, noPreEmpt] }),
    );
    expect(r.eligible_holders).toHaveLength(1);
    expect(r.eligible_holders[0].holder_id).toBe("founder-b");
    expect(r.eligible_holders[0].entitled_shares).toBe(1000);
  });

  it("excludes the seller themselves and zero/negative share balances", () => {
    const zeroHolder: CapTableHolder = { holder_id: "zero", held_shares: 0 };
    const negHolder: CapTableHolder = { holder_id: "neg", held_shares: -50 };
    const r = assessRofrWorkflow(
      input({
        cap_table: [FOUNDER_A, FOUNDER_B, ANGEL, zeroHolder, negHolder],
      }),
    );
    const ids = r.eligible_holders.map((h) => h.holder_id).sort();
    expect(ids).toEqual(["angel-1", "founder-b"]);
  });
});

describe("assessRofrWorkflow — notice window status", () => {
  it("returns pending_notice when notice_date is in the future", () => {
    const r = assessRofrWorkflow(
      input({ proposed_transfer: transfer({ notice_date_iso: "2026-08-15" }) }),
    );
    expect(r.status).toBe("pending_notice");
    expect(r.next_action).toMatch(/Serve the pre-emption notice/);
    expect(r.notice_deadline_iso).toBe("2026-08-30"); // +15 days default
  });

  it("returns notice_period_open when now is inside the window with outstanding holders", () => {
    const r = assessRofrWorkflow(input());
    // notice 2026-07-01 + 15 days = 2026-07-16; now = 2026-07-24 → past deadline
    // Adjust: use a fresher notice_date to land inside.
    const r2 = assessRofrWorkflow(
      input({ proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }) }),
    );
    expect(r2.status).toBe("notice_period_open");
    expect(r2.outstanding_holder_ids.sort()).toEqual([
      "angel-1",
      "founder-b",
    ]);
    expect(r2.next_action).toMatch(/Chase waivers/);
    // r itself (notice_date 2026-07-01): past deadline with 2 silent holders.
    expect(r.status).toBe("notice_period_closed");
    expect(r.next_action).toMatch(/deemed waiver/);
  });

  it("respects custom notice_period_days", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-01" }),
        notice_period_days: 30,
      }),
    );
    // 2026-07-01 + 30 = 2026-07-31 → now 2026-07-24 inside window.
    expect(r.notice_deadline_iso).toBe("2026-07-31");
    expect(r.status).toBe("notice_period_open");
  });

  it("falls back to the default when notice_period_days is invalid", () => {
    const r = assessRofrWorkflow(
      input({ notice_period_days: -5 as unknown as number }),
    );
    // Default 15 days from 2026-07-01 = 2026-07-16.
    expect(r.notice_deadline_iso).toBe("2026-07-16");
    expect(ROFR_DEFAULT_NOTICE_DAYS).toBe(15);
  });
});

describe("assessRofrWorkflow — waivers + exercises", () => {
  it("returns fully_waived when every eligible holder waived", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
        waivers: [
          { holder_id: "founder-b", waived_at_iso: "2026-07-21" },
          { holder_id: "angel-1", waived_at_iso: "2026-07-22" },
        ],
      }),
    );
    expect(r.status).toBe("fully_waived");
    expect(r.outstanding_holder_ids).toEqual([]);
    expect(r.shares_taken_by_rofr).toBe(0);
    expect(r.shares_remaining_for_third_party).toBe(1000);
    expect(r.next_action).toMatch(/Execute the share transfer form/);
  });

  it("returns partially_exercised when at least one holder took shares", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
        waivers: [{ holder_id: "angel-1", waived_at_iso: "2026-07-22" }],
        exercises: [
          {
            holder_id: "founder-b",
            exercised_at_iso: "2026-07-23",
            shares_taken: 500,
          },
        ],
      }),
    );
    expect(r.status).toBe("partially_exercised");
    expect(r.shares_taken_by_rofr).toBe(500);
    expect(r.shares_remaining_for_third_party).toBe(500);
    expect(r.next_action).toMatch(/two transfer forms/);
  });

  it("returns fully_exercised when the ROFR eats the whole block", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
        exercises: [
          {
            holder_id: "founder-b",
            exercised_at_iso: "2026-07-23",
            shares_taken: 667,
          },
          {
            holder_id: "angel-1",
            exercised_at_iso: "2026-07-23",
            shares_taken: 333,
          },
        ],
      }),
    );
    expect(r.status).toBe("fully_exercised");
    expect(r.shares_taken_by_rofr).toBe(1000);
    expect(r.shares_remaining_for_third_party).toBe(0);
    expect(r.next_action).toMatch(/does not proceed/);
  });

  it("caps exercises at the pro-rata entitlement and warns on over-subscription", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
        exercises: [
          {
            holder_id: "founder-b",
            exercised_at_iso: "2026-07-23",
            shares_taken: 900, // entitlement is 667
          },
        ],
      }),
    );
    const bob = r.eligible_holders.find((h) => h.holder_id === "founder-b")!;
    expect(bob.exercised_shares).toBe(667);
    expect(r.warnings.some((w) => /over-subscription/i.test(w))).toBe(true);
  });

  it("silently drops malformed waivers / exercises rather than throwing", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
        waivers: [{ holder_id: 42 as unknown as string, waived_at_iso: "" }],
        exercises: [
          {
            holder_id: "founder-b",
            exercised_at_iso: "",
            shares_taken: -10,
          },
          {
            holder_id: "angel-1",
            exercised_at_iso: "2026-07-23",
            shares_taken: Number.NaN,
          },
        ],
      }),
    );
    expect(r.shares_taken_by_rofr).toBe(0);
    expect(r.outstanding_holder_ids.sort()).toEqual([
      "angel-1",
      "founder-b",
    ]);
  });
});

describe("assessRofrWorkflow — tag-along + s707 flags", () => {
  it("fires tag-along when a founder sells ≥ 50% of their block", () => {
    const r = assessRofrWorkflow(
      input({ proposed_transfer: transfer({ share_count: 2500 }) }),
    );
    // founder-a holds 4000; 2500 / 4000 = 0.625 ≥ TAG_ALONG_FOUNDER_BLOCK_PCT.
    expect(r.tag_along_triggered).toBe(true);
    expect(r.warnings.some((w) => /tag-along/i.test(w))).toBe(true);
    expect(TAG_ALONG_FOUNDER_BLOCK_PCT).toBe(0.5);
  });

  it("does not fire tag-along when the seller is not a founder", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({
          seller_id: "angel-1",
          share_count: 1500, // 1500/2000 = 0.75 but seller is not a founder
        }),
      }),
    );
    expect(r.tag_along_triggered).toBe(false);
  });

  it("flags s707 on-sale risk when original issue was < 12 months ago", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({
          notice_date_iso: "2026-07-20",
          original_issue_date_iso: "2026-01-15",
        }),
      }),
    );
    expect(r.s707_on_sale_risk).toBe(true);
    expect(r.warnings.some((w) => /s707/i.test(w))).toBe(true);
  });

  it("does not flag s707 when the original issue is > 12 months old", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({
          notice_date_iso: "2026-07-20",
          original_issue_date_iso: "2024-01-15",
        }),
      }),
    );
    expect(r.s707_on_sale_risk).toBe(false);
  });
});

describe("assessRofrWorkflow — related-body-corporate exemption", () => {
  it("short-circuits to not_applicable + preserves shares_remaining", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({
          is_related_body_corporate_transfer: true,
        }),
      }),
    );
    expect(r.status).toBe("not_applicable");
    expect(r.eligible_holders).toEqual([]);
    expect(r.outstanding_holder_ids).toEqual([]);
    expect(r.shares_remaining_for_third_party).toBe(1000);
    expect(r.next_action).toMatch(/Related-body-corporate/i);
    expect(r.warnings.some((w) => /verify the exact wording/i.test(w))).toBe(
      true,
    );
  });

  it("still surfaces the s707 flag on a related-body-corporate transfer", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({
          is_related_body_corporate_transfer: true,
          notice_date_iso: "2026-07-20",
          original_issue_date_iso: "2026-01-15",
        }),
      }),
    );
    expect(r.status).toBe("not_applicable");
    expect(r.s707_on_sale_risk).toBe(true);
  });
});

describe("assessRofrWorkflow — degenerate inputs", () => {
  it("returns fully_waived when there are no other pre-emption holders on the register", () => {
    const r = assessRofrWorkflow(
      input({
        cap_table: [FOUNDER_A],
        proposed_transfer: transfer({ notice_date_iso: "2026-07-20" }),
      }),
    );
    expect(r.status).toBe("fully_waived");
    expect(r.shares_remaining_for_third_party).toBe(1000);
  });

  it("emits a warning when notice_date_iso is missing", () => {
    const r = assessRofrWorkflow(
      input({
        proposed_transfer: transfer({ notice_date_iso: "not-a-date" }),
      }),
    );
    expect(r.status).toBe("pending_notice");
    expect(r.notice_deadline_iso).toBe("");
    expect(
      r.warnings.some((w) => /notice_date_iso is missing/i.test(w)),
    ).toBe(true);
  });

  it("clamps a negative share_count to zero without throwing", () => {
    const r = assessRofrWorkflow(
      input({ proposed_transfer: transfer({ share_count: -50 }) }),
    );
    expect(r.eligible_holders.every((h) => h.entitled_shares === 0)).toBe(
      true,
    );
    expect(r.shares_remaining_for_third_party).toBe(0);
  });
});
