import { describe, it, expect } from "vitest";
import {
  buildAdvisorClientList,
  buildAttributionHistory,
  buildResellerAdminMembership,
  buildRolesPermissionsPanel,
  KNOWN_PERMISSIONS,
} from "./user-panels";

describe("buildRolesPermissionsPanel", () => {
  it("normalises a jsonb array of permissions and preserves order + dedup", () => {
    const out = buildRolesPermissionsPanel({
      role: "user",
      custom_role: "beta_champion",
      permissions: ["reseller.console", "advisor_portal", "reseller.console"],
    });
    expect(out.base_role).toBe("user");
    expect(out.custom_role).toBe("beta_champion");
    expect(out.permissions).toEqual(["reseller.console", "advisor_portal"]);
    expect(out.unknown_permissions).toEqual([]);
  });

  it("parses a JSON-encoded string of permissions (PostgREST edge case)", () => {
    const out = buildRolesPermissionsPanel({
      role: "admin",
      custom_role: "  ",
      permissions: '["esop.manage","freeform.custom"]',
    });
    expect(out.base_role).toBe("admin");
    expect(out.custom_role).toBeNull();
    expect(out.permissions).toEqual(["esop.manage", "freeform.custom"]);
    expect(out.unknown_permissions).toEqual(["freeform.custom"]);
  });

  it("treats null / non-array / malformed jsonb as an empty array", () => {
    expect(
      buildRolesPermissionsPanel({ role: null, custom_role: null, permissions: null })
        .permissions,
    ).toEqual([]);
    expect(
      buildRolesPermissionsPanel({ role: null, custom_role: null, permissions: 42 })
        .permissions,
    ).toEqual([]);
    expect(
      buildRolesPermissionsPanel({ role: null, custom_role: null, permissions: "not-json" })
        .permissions,
    ).toEqual([]);
  });

  it("classifies base_role by exact 'admin' match — any other value is 'user'", () => {
    expect(
      buildRolesPermissionsPanel({ role: "Admin", custom_role: null, permissions: [] })
        .base_role,
    ).toBe("user");
    expect(
      buildRolesPermissionsPanel({ role: "admin", custom_role: null, permissions: [] })
        .base_role,
    ).toBe("admin");
  });

  it("exposes the KNOWN_PERMISSIONS list so the UI can render checkbox grids", () => {
    const out = buildRolesPermissionsPanel({ role: "user", custom_role: null, permissions: [] });
    expect(out.known_permissions).toBe(KNOWN_PERMISSIONS);
  });
});

describe("buildAttributionHistory", () => {
  it("joins reseller code/display_name and sorts newest first", () => {
    const resellers = new Map([
      ["r-1", { id: "r-1", code: "INFOVISION", display_name: "InfoVision" }],
      ["r-2", { id: "r-2", code: "ACME", display_name: "Acme Ventures" }],
    ]);
    const out = buildAttributionHistory(
      [
        {
          reseller_id: "r-1",
          subject_type: "user",
          subject_project_id: null,
          source: "code",
          status: "active",
          opted_out: false,
          opted_out_at: null,
          attributed_at: "2026-07-20T00:00:00Z",
        },
        {
          reseller_id: "r-2",
          subject_type: "project",
          subject_project_id: "p-99",
          source: "provisioned",
          status: "revoked",
          opted_out: true,
          opted_out_at: "2026-07-22T00:00:00Z",
          attributed_at: "2026-07-22T00:00:00Z",
        },
      ],
      resellers,
    );
    expect(out[0].reseller_code).toBe("ACME");
    expect(out[0].opted_out).toBe(true);
    expect(out[0].subject_type).toBe("project");
    expect(out[1].reseller_code).toBe("INFOVISION");
  });

  it("keeps rows whose reseller cannot be resolved (renders '—' upstream)", () => {
    const out = buildAttributionHistory(
      [
        {
          reseller_id: "r-orphan",
          subject_type: "user",
          subject_project_id: null,
          source: "admin_manual",
          status: "active",
          opted_out: false,
          opted_out_at: null,
          attributed_at: "2026-07-22T00:00:00Z",
        },
      ],
      new Map(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].reseller_code).toBeNull();
    expect(out[0].reseller_display_name).toBeNull();
  });
});

describe("buildResellerAdminMembership", () => {
  it("sorts active rows before revoked, newest linked_at first within each group", () => {
    const resellers = new Map([
      ["r-1", { id: "r-1", code: "A", display_name: "A" }],
      ["r-2", { id: "r-2", code: "B", display_name: "B" }],
      ["r-3", { id: "r-3", code: "C", display_name: "C" }],
    ]);
    const out = buildResellerAdminMembership(
      [
        {
          reseller_id: "r-1",
          role: "admin",
          status: "revoked",
          linked_at: "2026-01-01T00:00:00Z",
          revoked_at: "2026-06-01T00:00:00Z",
        },
        {
          reseller_id: "r-2",
          role: "owner",
          status: "active",
          linked_at: "2026-03-01T00:00:00Z",
          revoked_at: null,
        },
        {
          reseller_id: "r-3",
          role: "viewer",
          status: "active",
          linked_at: "2026-05-01T00:00:00Z",
          revoked_at: null,
        },
      ],
      resellers,
    );
    expect(out.map((r) => r.reseller_code)).toEqual(["C", "B", "A"]);
  });
});

describe("buildAdvisorClientList", () => {
  it("enriches with client email/display_name and sorts active first", () => {
    const clients = new Map([
      ["u-1", { id: "u-1", email: "one@example.com", display_name: "Client One" }],
      ["u-2", { id: "u-2", email: "two@example.com", display_name: null }],
    ]);
    const out = buildAdvisorClientList(
      [
        {
          client_id: "u-1",
          status: "revoked",
          linked_at: "2026-02-01T00:00:00Z",
        },
        {
          client_id: "u-2",
          status: "active",
          linked_at: "2026-04-01T00:00:00Z",
        },
      ],
      clients,
    );
    expect(out[0].client_id).toBe("u-2");
    expect(out[0].client_display_name).toBeNull();
    expect(out[1].client_id).toBe("u-1");
    expect(out[1].client_display_name).toBe("Client One");
  });

  it("handles missing client lookup rows (deleted counterparties)", () => {
    const out = buildAdvisorClientList(
      [{ client_id: "u-ghost", status: "active", linked_at: "2026-07-01T00:00:00Z" }],
      new Map(),
    );
    expect(out[0].client_email).toBeNull();
    expect(out[0].client_display_name).toBeNull();
  });
});
