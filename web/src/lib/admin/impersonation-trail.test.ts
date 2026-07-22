import { describe, it, expect } from "vitest";
import {
  buildImpersonationTrail,
  flattenImpersonationTrail,
  IMPERSONATION_ACTIONS,
  isImpersonationAction,
  summariseEvent,
  type AuditEventRow,
  type UserLookupRow,
} from "./impersonation-trail";

function usersMap(
  entries: Array<[string, Partial<UserLookupRow>]>,
): ReadonlyMap<string, UserLookupRow> {
  const m = new Map<string, UserLookupRow>();
  for (const [id, u] of entries) {
    m.set(id, {
      id,
      email: u.email ?? `${id}@example.com`,
      display_name: u.display_name ?? null,
    });
  }
  return m;
}

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";

describe("IMPERSONATION_ACTIONS", () => {
  it("covers the six admin.* actions the P12.5-P12.7 endpoints emit", () => {
    expect(IMPERSONATION_ACTIONS).toEqual([
      "admin.role.changed",
      "admin.credits.granted",
      "admin.plan.changed",
      "admin.permissions.granted",
      "admin.permissions.revoked",
      "admin.user.created",
    ]);
  });
});

describe("isImpersonationAction", () => {
  it("accepts each of the six known actions", () => {
    for (const a of IMPERSONATION_ACTIONS) {
      expect(isImpersonationAction(a)).toBe(true);
    }
  });

  it("rejects unrelated audit actions and non-strings", () => {
    expect(isImpersonationAction("consent.recorded")).toBe(false);
    expect(isImpersonationAction("admin.something_else")).toBe(false);
    expect(isImpersonationAction(null)).toBe(false);
    expect(isImpersonationAction(undefined)).toBe(false);
    expect(isImpersonationAction(42)).toBe(false);
  });
});

describe("summariseEvent", () => {
  it("formats a role change with both previous and new", () => {
    expect(
      summariseEvent("admin.role.changed", {
        previous_role: "user",
        new_role: "admin",
      }),
    ).toBe("Role user → admin");
  });

  it("formats a role change with only new_role", () => {
    expect(summariseEvent("admin.role.changed", { new_role: "admin" })).toBe(
      "Role set to admin",
    );
  });

  it("formats a credits grant with amount + reason", () => {
    expect(
      summariseEvent("admin.credits.granted", {
        amount: 50,
        reason: "affiliate_view_bonus",
      }),
    ).toBe("Granted 50 credits (affiliate_view_bonus)");
  });

  it("tolerates missing amount on credits grant", () => {
    expect(summariseEvent("admin.credits.granted", {})).toBe("Credits granted");
  });

  it("formats a plan change with credits reconciliation", () => {
    expect(
      summariseEvent("admin.plan.changed", {
        previous_plan: "free",
        new_plan: "founder_growth",
        credits_granted: 200,
      }),
    ).toBe("Plan free → founder_growth (+200 credits)");
  });

  it("formats a plan change without a grant", () => {
    expect(
      summariseEvent("admin.plan.changed", {
        previous_plan: "free",
        new_plan: "founder_growth",
        credits_granted: 0,
      }),
    ).toBe("Plan free → founder_growth");
  });

  it("formats permission grants and revokes", () => {
    expect(
      summariseEvent("admin.permissions.granted", { permission: "reseller.console" }),
    ).toBe("Granted permission reseller.console");
    expect(
      summariseEvent("admin.permissions.revoked", { permission: "esop.manage" }),
    ).toBe("Revoked permission esop.manage");
  });

  it("formats a user-created event with segment + account_type", () => {
    expect(
      summariseEvent("admin.user.created", {
        segment: "founder",
        account_type: "founder",
      }),
    ).toBe("Created user (founder / founder)");
  });
});

describe("buildImpersonationTrail", () => {
  const users = usersMap([
    [U1, { email: "alice@example.com", display_name: "Alice" }],
    [U2, { email: "bob@example.com", display_name: "Bob" }],
  ]);

  it("groups events by target_user_id and sorts newest-first", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U1,
        detail: { previous_role: "user", new_role: "admin", actor_email: "root@blockid.au" },
        user_id: null,
      },
      {
        id: 2,
        ts: "2026-07-20T00:00:00Z",
        actor: "admin",
        action: "admin.credits.granted",
        resource_id: U1,
        detail: { amount: 100, reason: "welcome", actor_email: "root@blockid.au" },
        user_id: null,
      },
      {
        id: 3,
        ts: "2026-07-15T00:00:00Z",
        actor: "admin",
        action: "admin.plan.changed",
        resource_id: U2,
        detail: { previous_plan: "free", new_plan: "founder_growth" },
        user_id: null,
      },
    ];

    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1, U2]),
      users,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].target_user_id).toBe(U1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["2", "1"]);
    expect(groups[1].target_user_id).toBe(U2);
    expect(groups[1].events).toHaveLength(1);
  });

  it("masks the target email using the users lookup", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U1,
        detail: { new_role: "admin" },
        user_id: null,
      },
    ];
    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1]),
      users,
    });
    expect(groups[0].target_email_masked).toBe("al***@example.com");
    expect(groups[0].target_display_name).toBe("Alice");
  });

  it("skips non-admin actors and unrelated actions", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "user",
        action: "admin.role.changed",
        resource_id: U1,
        detail: {},
        user_id: null,
      },
      {
        id: 2,
        ts: "2026-07-11T00:00:00Z",
        actor: "admin",
        action: "consent.recorded",
        resource_id: U1,
        detail: {},
        user_id: null,
      },
    ];
    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1]),
      users,
    });
    expect(groups).toHaveLength(0);
  });

  it("skips rows whose target is outside the attribution set", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U3,
        detail: {},
        user_id: null,
      },
    ];
    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1, U2]),
      users,
    });
    expect(groups).toHaveLength(0);
  });

  it("groups whose latest event is newest come first", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U1,
        detail: { new_role: "admin" },
        user_id: null,
      },
      {
        id: 2,
        ts: "2026-07-22T00:00:00Z",
        actor: "admin",
        action: "admin.credits.granted",
        resource_id: U2,
        detail: { amount: 50 },
        user_id: null,
      },
    ];
    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1, U2]),
      users,
    });
    expect(groups[0].target_user_id).toBe(U2);
    expect(groups[1].target_user_id).toBe(U1);
  });

  it("preserves rows whose target user is missing from the lookup", () => {
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U1,
        detail: { target_email: "orphan@example.com", new_role: "admin" },
        user_id: null,
      },
    ];
    const groups = buildImpersonationTrail({
      events,
      allowedUserIds: new Set([U1]),
      users: new Map(),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].target_email_masked).toBe("—");
    expect(groups[0].events[0].target_email_masked).toBe("or***@example.com");
  });
});

describe("flattenImpersonationTrail", () => {
  it("returns a single newest-first list across groups", () => {
    const users = usersMap([
      [U1, {}],
      [U2, {}],
    ]);
    const events: AuditEventRow[] = [
      {
        id: 1,
        ts: "2026-07-10T00:00:00Z",
        actor: "admin",
        action: "admin.role.changed",
        resource_id: U1,
        detail: { new_role: "admin" },
        user_id: null,
      },
      {
        id: 2,
        ts: "2026-07-22T00:00:00Z",
        actor: "admin",
        action: "admin.credits.granted",
        resource_id: U2,
        detail: { amount: 50 },
        user_id: null,
      },
      {
        id: 3,
        ts: "2026-07-15T00:00:00Z",
        actor: "admin",
        action: "admin.plan.changed",
        resource_id: U1,
        detail: { new_plan: "founder_growth" },
        user_id: null,
      },
    ];
    const flat = flattenImpersonationTrail(
      buildImpersonationTrail({
        events,
        allowedUserIds: new Set([U1, U2]),
        users,
      }),
    );
    expect(flat.map((e) => e.id)).toEqual(["2", "3", "1"]);
  });
});
