import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { attachReviewBadge, readReviewBadgeState, reviewBadgeLabel, reviewerPublicName, revokeReviewBadge } from "./badge";
import { fakeDb } from "./fake-db.testkit";

const REVIEWED = { reviewed: true, reviewedAt: "2026-10-21T03:00:00.000Z", reviewerName: "Long Do" };

describe("BlockID Reviewed badge", () => {
  it("label: prefix · Sydney date · reviewer", () => {
    expect(reviewBadgeLabel("2026-10-21T03:00:00.000Z", "Long Do")).toBe("BlockID Reviewed · 21 Oct 2026 · Long Do");
    // 22:30 UTC on the 20th is already the 21st in Sydney.
    expect(reviewBadgeLabel("2026-10-20T22:30:00.000Z", "Long Do")).toContain("21 Oct 2026");
  });

  it("reviewer name never leaks an e-mail address", () => {
    expect(reviewerPublicName("admin@blockid.au")).toBe("BlockID team");
    expect(reviewerPublicName("  ")).toBe("BlockID team");
    expect(reviewerPublicName(null)).toBe("BlockID team");
    expect(reviewerPublicName("Long <b>Do</b>")).toBe("Long b Do /b");
  });

  it("attached only for the Verified tier while reviewed=true; stripped otherwise", () => {
    const report = demoReportV2();
    const verified = attachReviewBadge(report, "verified", REVIEWED);
    expect(verified.reviewBadge?.label).toBe("BlockID Reviewed · 21 Oct 2026 · Long Do");
    expect(attachReviewBadge(report, "full", REVIEWED).reviewBadge).toBeUndefined();
    expect(attachReviewBadge(report, "verified", { ...REVIEWED, reviewed: false }).reviewBadge).toBeUndefined();
    expect(attachReviewBadge(report, "verified", null).reviewBadge).toBeUndefined();
    // A stray badge on a non-qualifying document is removed.
    expect("reviewBadge" in attachReviewBadge(verified, "snapshot", REVIEWED)).toBe(false);
  });

  it("reads the stored state + reviewer name; fail-soft when 0474 is missing; revoke flips reviewed=false", async () => {
    const db = fakeDb({
      tables: {
        assembled_reports: [{ id: "r1", reviewed: true, reviewed_at: REVIEWED.reviewedAt, reviewed_by: "u-admin" }],
        app_users: [{ id: "u-admin", display_name: "Long Do", email: "admin@blockid.au" }],
      },
    });
    expect(await readReviewBadgeState(db as never, "r1")).toEqual(REVIEWED);
    expect(await revokeReviewBadge(db as never, "r1")).toBe(true);
    expect((await readReviewBadgeState(db as never, "r1"))?.reviewed).toBe(false);

    const old = fakeDb({ tables: { assembled_reports: [{ id: "r1" }] }, missingColumns: { assembled_reports: ["reviewed"] } });
    expect(await readReviewBadgeState(old as never, "r1")).toBeNull();
    expect(await readReviewBadgeState(old as never, null)).toBeNull();
  });
});
