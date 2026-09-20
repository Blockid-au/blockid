import { describe, expect, it } from "vitest";
import { buildDataEthicsPanel, CONNECTOR_STALE_DAYS, matchesProjectName } from "./data-ethics";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

const EMPTY = { now: NOW, evidenceRows: [], investorLinks: [], mentorGrants: [], members: [], dataRoomViews: null, connections: [], snapshots: [], lastAnalysisAt: null };

describe("buildDataEthicsPanel", () => {
  it("empty input → zero counts, no access, no shares, no refresh rows, the fixed links", () => {
    const p = buildDataEthicsPanel(EMPTY);
    expect(p.evidence).toEqual({ total: 0, verified: 0, pendingReview: 0, byLevel: {} });
    expect(p.access).toEqual([]);
    expect(p.shared).toEqual([]);
    expect(p.refreshed).toEqual([]);
    expect(p.links.scoreLogic).toBe("/methodology/governance");
    expect(p.links.revokeAccess).toBe("/workspace/investors/access#investor-links");
  });

  it("evidence counts by level, verified and pending review", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      evidenceRows: [
        { confidence_level: "document_uploaded", is_verified: false, review_status: "pending" },
        { confidence_level: "document_uploaded", is_verified: true, review_status: "approved" },
        { confidence_level: "connected_source", is_verified: false, review_status: null },
        { confidence_level: null, is_verified: null, review_status: null },
      ],
    });
    expect(p.evidence).toEqual({ total: 4, verified: 1, pendingReview: 1, byLevel: { document_uploaded: 2, connected_source: 1, unknown: 1 } });
  });

  it("who has access: only ACTIVE investor links + grants (revoked / expired dropped), members masked", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      investorLinks: [
        { investorName: "Jane", investorEmail: "jane@fund.vc", fundName: "Fund A", revokedAt: null, expiresAt: daysAgo(-10), viewCount: 3, lastViewedAt: daysAgo(1) },
        { investorName: null, investorEmail: "old@fund.vc", fundName: null, revokedAt: daysAgo(2), expiresAt: null, viewCount: 1, lastViewedAt: daysAgo(3) },
        { investorName: null, investorEmail: "exp@fund.vc", fundName: null, revokedAt: null, expiresAt: daysAgo(1), viewCount: 0, lastViewedAt: null },
      ],
      mentorGrants: [
        { tier: "reports_full", mentor_user_id: "m1", reseller_id: null, granted_at: daysAgo(30), expires_at: null, revoked_at: null },
        { tier: "summary", mentor_user_id: "m2", reseller_id: "r1", granted_at: daysAgo(30), expires_at: null, revoked_at: daysAgo(1) },
      ],
      members: [{ email: "cto@acme.io", role: "editor" }],
    });
    expect(p.access).toEqual([
      { kind: "investor_link", label: "Jane", detail: "Fund A", until: daysAgo(-10) },
      { kind: "mentor_grant", label: "Mentor", detail: "reports full access", until: null },
      { kind: "member", label: "c***@acme.io", detail: "editor on this startup", until: null },
    ]);
    // what was shared — every link with views, including the revoked one, newest first
    expect(p.shared.map((s) => s.label)).toEqual(["Investor link — Jane", "Investor link — o***@fund.vc (revoked)"]);
    expect(p.shared[0].views).toBe(3);
  });

  it("data-room views are listed only when > 0", () => {
    expect(buildDataEthicsPanel({ ...EMPTY, dataRoomViews: { views: 0, lastViewedAt: null } }).shared).toEqual([]);
    expect(buildDataEthicsPanel({ ...EMPTY, dataRoomViews: { views: 4, lastViewedAt: daysAgo(2) } }).shared).toEqual([{ label: "Public score page / data room", views: 4, lastViewedAt: daysAgo(2) }]);
  });

  it(`last refreshed: fresh under ${CONNECTOR_STALE_DAYS} days, stale over, never when unsynced, error when the token is unreadable; snapshots count too`, () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      connections: [
        { provider: "github", status: "active", lastSyncAt: daysAgo(2), lastSyncError: null },
        { provider: "stripe", status: "active", lastSyncAt: daysAgo(60), lastSyncError: null },
        { provider: "ga4", status: "active", lastSyncAt: null, lastSyncError: null },
        { provider: "ga4", status: "revoked", lastSyncAt: daysAgo(1), lastSyncError: null },
      ],
      snapshots: [
        { provider: "stripe", taken_at: daysAgo(3) },
        { provider: "xero", taken_at: daysAgo(40) },
      ],
      lastAnalysisAt: daysAgo(5),
    });
    expect(p.refreshed).toEqual([
      { label: "GitHub", at: daysAgo(2), status: "fresh", note: null },
      { label: "Stripe", at: daysAgo(3), status: "fresh", note: null }, // the newer snapshot wins over the old sync
      { label: "Google Analytics", at: null, status: "never", note: "connected, not yet synced" },
      { label: "Xero", at: daysAgo(40), status: "stale", note: null },
    ]);
    expect(p.lastAnalysisAt).toBe(daysAgo(5));
    const err = buildDataEthicsPanel({ ...EMPTY, connections: [{ provider: "stripe", status: "active", lastSyncAt: daysAgo(1), lastSyncError: null, tokenUnreadable: true }] });
    expect(err.refreshed[0]).toMatchObject({ label: "Stripe", status: "error", note: "reconnect needed" });
  });
});

describe("project scoping (G21 P1 post-ship review)", () => {
  it("matchesProjectName: case / punctuation / entity-suffix insensitive, unknown never matches", () => {
    expect(matchesProjectName("Acme Pty Ltd", "ACME")).toBe(true);
    expect(matchesProjectName("acme-labs", "Acme Labs")).toBe(true);
    expect(matchesProjectName("Acme", "Acme Labs")).toBe(false);
    expect(matchesProjectName(null, "Acme")).toBe(false);
    expect(matchesProjectName("Acme", null)).toBe(false);
    expect(matchesProjectName("Pty Ltd", "Pty Ltd")).toBe(false);
  });

  it("investor links are attributed through the score's company name; the rest are counted, not shown — access AND shared", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      projectId: "proj-1",
      projectName: "Acme Labs",
      investorLinks: [
        { investorName: "Jane", investorEmail: "jane@fund.vc", fundName: "Fund A", revokedAt: null, expiresAt: null, viewCount: 3, lastViewedAt: daysAgo(1), companyName: "Acme Labs Pty Ltd" },
        { investorName: "Zed", investorEmail: "zed@other.vc", fundName: "Other", revokedAt: null, expiresAt: null, viewCount: 9, lastViewedAt: daysAgo(0), companyName: "Other Co" },
        { investorName: "Nul", investorEmail: null, fundName: null, revokedAt: null, expiresAt: null, viewCount: 1, lastViewedAt: daysAgo(2), companyName: null },
      ],
    });
    expect(p.access.map((a) => a.label)).toEqual(["Jane"]);
    expect(p.shared.map((s) => s.label)).toEqual(["Investor link — Jane"]);
    expect(p.unattributedInvestorLinks).toBe(2);
  });

  it("unscoped (no projectId / projectName) keeps every link — legacy callers", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      investorLinks: [{ investorName: "Zed", investorEmail: null, fundName: null, revokedAt: null, expiresAt: null, viewCount: 0, lastViewedAt: null, companyName: "Other Co" }],
    });
    expect(p.access.map((a) => a.label)).toEqual(["Zed"]);
    expect(p.unattributedInvestorLinks).toBe(0);
  });

  it("mentor grants + connections: rows for another project are dropped, NULL project_id (all projects) kept", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      projectId: "proj-1",
      projectName: "Acme",
      mentorGrants: [
        { tier: "full_mentor", mentor_user_id: "m1", reseller_id: "r1", project_id: "proj-OTHER", granted_at: daysAgo(3), expires_at: null, revoked_at: null },
        { tier: "reports_shared", mentor_user_id: "m2", reseller_id: null, project_id: null, granted_at: daysAgo(3), expires_at: null, revoked_at: null },
        { tier: "attributed_only", mentor_user_id: "m3", reseller_id: null, project_id: "proj-1", granted_at: daysAgo(3), expires_at: null, revoked_at: null },
      ],
      connections: [
        { provider: "github", status: "active", lastSyncAt: daysAgo(1), lastSyncError: null, projectId: "proj-OTHER" },
        { provider: "stripe", status: "active", lastSyncAt: daysAgo(1), lastSyncError: null, projectId: null },
        { provider: "ga4", status: "active", lastSyncAt: daysAgo(1), lastSyncError: null, projectId: "proj-1" },
      ],
    });
    expect(p.access.map((a) => [a.kind, a.detail])).toEqual([
      ["mentor_grant", "reports shared access"],
      ["mentor_grant", "attributed only access"],
    ]);
    expect(p.refreshed.map((r) => r.label)).toEqual(["Stripe", "Google Analytics"]);
  });

  it("evaluator seats are listed as access with a masked e-mail, the consent tier and the unclaimed marker", () => {
    const p = buildDataEthicsPanel({
      ...EMPTY,
      projectId: "proj-1",
      projectName: "Acme",
      evaluators: [
        { evaluatorEmail: "scout@fund.vc", consentTier: "reports_shared", claimedAt: daysAgo(4) },
        { evaluatorEmail: null, consentTier: null, claimedAt: null },
      ],
    });
    expect(p.access).toEqual([
      { kind: "evaluator", label: "s***@fund.vc", detail: "evaluator · reports shared — claim records without source links", until: null },
      { kind: "evaluator", label: "Evaluator", detail: "evaluator · attributed only — statuses and counts, no records · not yet claimed by you", until: null },
    ]);
  });
});
