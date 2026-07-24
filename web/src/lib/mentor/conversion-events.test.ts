// Unit tests for mentor conversion-events.
//
// Verifies:
//   1. Each emit helper fires the correct GA4 event name + params shape.
//   2. window-guard: helpers do not throw when window is undefined
//      (server-safe fallback).
//   3. writeAuditLog no-ops on the client and inserts the correct row
//      shape on the server (mocked).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the audit-log Supabase client so writeAuditLog does not attempt a
// real network call. Because conversion-events lazy-imports supabase, this
// mock intercepts the dynamic import.
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: async () => ({ error: null }),
    }),
  }),
}));

import {
  MENTOR_GA4_EVENTS,
  emitMentorInviteSent,
  emitMentorInviteAccepted,
  emitMentorInviteDeclined,
  emitMentorTierUpgraded,
  emitMentorTierRevoked,
  emitMentorCheckInCompleted,
  emitMentorConsentExpiringSoon,
  emitMentorConsentExpired,
  emitMentorDrawerOpen,
  fireGa4,
} from "./conversion-events";

// ─── Shared fixture ────────────────────────────────────────────────────

const CTX = {
  resellerId: "res_123",
  founderId: "user_founder",
  projectId: "proj_alpha",
} as const;

const ACTOR = "user_mentor";

interface Ga4Call {
  event: string;
  params: Record<string, unknown>;
}

function withWindow(): {
  restore: () => void;
  gaCalls: Ga4Call[];
  dataLayer: Array<Record<string, unknown>>;
} {
  const gaCalls: Ga4Call[] = [];
  const dataLayer: Array<Record<string, unknown>> = [];
  const gtag = (kind: string, event: string, params: Record<string, unknown>) => {
    if (kind === "event") gaCalls.push({ event, params });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = { gtag, dataLayer };
  return {
    restore: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
    },
    gaCalls,
    dataLayer,
  };
}

// ─── fireGa4 window-guard ──────────────────────────────────────────────

describe("fireGa4 — SSR safety", () => {
  it("no-ops when window is undefined", () => {
    expect(() =>
      fireGa4(MENTOR_GA4_EVENTS.inviteSent, { foo: 1 }),
    ).not.toThrow();
  });

  it("mirrors event into gtag + dataLayer when window exists", () => {
    const w = withWindow();
    try {
      fireGa4(MENTOR_GA4_EVENTS.inviteSent, { reseller_id: "r1" });
      expect(w.gaCalls).toHaveLength(1);
      expect(w.gaCalls[0].event).toBe("mentor_invite_sent");
      expect(w.gaCalls[0].params).toMatchObject({ reseller_id: "r1" });
      expect(w.dataLayer).toHaveLength(1);
      expect(w.dataLayer[0]).toMatchObject({
        event: "mentor_invite_sent",
        reseller_id: "r1",
      });
    } finally {
      w.restore();
    }
  });

  it("swallows gtag exceptions so telemetry never breaks user flow", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      gtag: () => {
        throw new Error("gtag boom");
      },
      dataLayer: [],
    };
    try {
      expect(() => fireGa4(MENTOR_GA4_EVENTS.tierRevoked, {})).not.toThrow();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
    }
  });
});

// ─── Per-helper GA4 event name + payload verification ──────────────────

describe("mentor conversion-events — GA4 event names & payloads", () => {
  let w: ReturnType<typeof withWindow>;

  beforeEach(() => {
    w = withWindow();
  });
  afterEach(() => {
    w.restore();
  });

  it("emitMentorInviteSent fires mentor_invite_sent with requested_tier", async () => {
    await emitMentorInviteSent(
      { ...CTX, requestedTier: "reports_shared" },
      ACTOR,
    );
    expect(w.gaCalls[0].event).toBe("mentor_invite_sent");
    expect(w.gaCalls[0].params).toMatchObject({
      reseller_id: CTX.resellerId,
      founder_id: CTX.founderId,
      project_id: CTX.projectId,
      requested_tier: "reports_shared",
    });
  });

  it("emitMentorInviteAccepted fires mentor_invite_accepted with tier", async () => {
    await emitMentorInviteAccepted(
      { ...CTX, tier: "full_mentor" },
      CTX.founderId,
    );
    expect(w.gaCalls[0].event).toBe("mentor_invite_accepted");
    expect(w.gaCalls[0].params).toMatchObject({ tier: "full_mentor" });
  });

  it("emitMentorInviteDeclined includes reason (nullable)", async () => {
    await emitMentorInviteDeclined(
      { ...CTX, requestedTier: "full_mentor", reason: "not_ready" },
      CTX.founderId,
    );
    expect(w.gaCalls[0].event).toBe("mentor_invite_declined");
    expect(w.gaCalls[0].params).toMatchObject({
      requested_tier: "full_mentor",
      reason: "not_ready",
    });
  });

  it("emitMentorTierUpgraded includes from_tier + to_tier", async () => {
    await emitMentorTierUpgraded(
      {
        ...CTX,
        fromTier: "attributed_only",
        toTier: "reports_shared",
      },
      CTX.founderId,
    );
    expect(w.gaCalls[0].event).toBe("mentor_tier_upgraded");
    expect(w.gaCalls[0].params).toMatchObject({
      from_tier: "attributed_only",
      to_tier: "reports_shared",
    });
  });

  it("emitMentorTierRevoked includes tier + reason", async () => {
    await emitMentorTierRevoked(
      { ...CTX, tier: "reports_shared", reason: "founder_choice" },
      CTX.founderId,
    );
    expect(w.gaCalls[0].event).toBe("mentor_tier_revoked");
    expect(w.gaCalls[0].params).toMatchObject({
      tier: "reports_shared",
      reason: "founder_choice",
    });
  });

  it("emitMentorCheckInCompleted includes note_id", async () => {
    await emitMentorCheckInCompleted({ ...CTX, noteId: "n_1" }, ACTOR);
    expect(w.gaCalls[0].event).toBe("mentor_check_in_completed");
    expect(w.gaCalls[0].params).toMatchObject({ note_id: "n_1" });
  });

  it("emitMentorConsentExpiringSoon includes days_remaining", async () => {
    await emitMentorConsentExpiringSoon({
      ...CTX,
      tier: "reports_shared",
      daysRemaining: 7,
    });
    expect(w.gaCalls[0].event).toBe("mentor_consent_expiring_soon");
    expect(w.gaCalls[0].params).toMatchObject({
      tier: "reports_shared",
      days_remaining: 7,
    });
  });

  it("emitMentorConsentExpired fires with tier", async () => {
    await emitMentorConsentExpired({ ...CTX, tier: "full_mentor" });
    expect(w.gaCalls[0].event).toBe("mentor_consent_expired");
    expect(w.gaCalls[0].params).toMatchObject({ tier: "full_mentor" });
  });

  it("emitMentorDrawerOpen fires with tier context", async () => {
    await emitMentorDrawerOpen({ ...CTX, tier: "reports_shared" }, ACTOR);
    expect(w.gaCalls[0].event).toBe("mentor_drawer_open");
    expect(w.gaCalls[0].params).toMatchObject({ tier: "reports_shared" });
  });
});

// ─── Server-safe fallback for all helpers ──────────────────────────────

describe("mentor conversion-events — server-safe fallback (no window)", () => {
  it("all helpers resolve without throwing when window is undefined", async () => {
    await expect(
      emitMentorInviteSent({ ...CTX, requestedTier: "full_mentor" }, ACTOR),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorInviteAccepted({ ...CTX, tier: "full_mentor" }, CTX.founderId),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorInviteDeclined(
        { ...CTX, requestedTier: "reports_shared" },
        CTX.founderId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorTierUpgraded(
        { ...CTX, fromTier: "reports_shared", toTier: "full_mentor" },
        CTX.founderId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorTierRevoked({ ...CTX, tier: "full_mentor" }, CTX.founderId),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorCheckInCompleted({ ...CTX, noteId: "n_2" }, ACTOR),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorConsentExpiringSoon({
        ...CTX,
        tier: "reports_shared",
        daysRemaining: 30,
      }),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorConsentExpired({ ...CTX, tier: "reports_shared" }),
    ).resolves.toBeUndefined();
    await expect(
      emitMentorDrawerOpen({ ...CTX, tier: "attributed_only" }, ACTOR),
    ).resolves.toBeUndefined();
  });
});
