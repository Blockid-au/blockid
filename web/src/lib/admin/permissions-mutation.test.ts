import { describe, it, expect } from "vitest";
import {
  applyPermissionMutation,
  normalisePermissionsColumn,
  validatePermissionBody,
} from "./permissions-mutation";

describe("validatePermissionBody", () => {
  it("accepts a known permission with action=grant", () => {
    const out = validatePermissionBody({
      action: "grant",
      permission: "reseller.console",
    });
    expect(out).toEqual({
      ok: true,
      value: { action: "grant", permission: "reseller.console" },
    });
  });

  it("accepts an ad-hoc slug shape (letters, digits, underscore, dot)", () => {
    const out = validatePermissionBody({
      action: "revoke",
      permission: "reports.export_v2",
    });
    expect(out.ok).toBe(true);
  });

  it("trims incoming permission whitespace", () => {
    const out = validatePermissionBody({
      action: "grant",
      permission: "   esop.manage   ",
    });
    expect(out).toEqual({
      ok: true,
      value: { action: "grant", permission: "esop.manage" },
    });
  });

  it("rejects a non-object body", () => {
    expect(validatePermissionBody(null).ok).toBe(false);
    expect(validatePermissionBody("permission").ok).toBe(false);
    expect(validatePermissionBody(42).ok).toBe(false);
  });

  it("rejects an unknown action", () => {
    const out = validatePermissionBody({ action: "delete", permission: "esop.manage" });
    expect(out).toEqual({ ok: false, reason: "action_invalid" });
  });

  it("rejects a missing permission field", () => {
    const out = validatePermissionBody({ action: "grant" });
    expect(out).toEqual({ ok: false, reason: "permission_invalid" });
  });

  it("rejects an empty permission string", () => {
    const out = validatePermissionBody({ action: "grant", permission: "   " });
    expect(out).toEqual({ ok: false, reason: "permission_invalid" });
  });

  it("rejects a permission starting with a digit", () => {
    const out = validatePermissionBody({ action: "grant", permission: "1write" });
    expect(out).toEqual({ ok: false, reason: "permission_slug_invalid" });
  });

  it("rejects a permission with uppercase or spaces", () => {
    expect(
      validatePermissionBody({ action: "grant", permission: "Reseller.Console" }),
    ).toEqual({ ok: false, reason: "permission_slug_invalid" });
    expect(
      validatePermissionBody({ action: "grant", permission: "reseller console" }),
    ).toEqual({ ok: false, reason: "permission_slug_invalid" });
  });

  it("rejects a permission over 64 characters", () => {
    const slug = "a" + "b".repeat(64);
    expect(
      validatePermissionBody({ action: "grant", permission: slug }),
    ).toEqual({ ok: false, reason: "permission_slug_invalid" });
  });
});

describe("normalisePermissionsColumn", () => {
  it("returns [] for null", () => {
    expect(normalisePermissionsColumn(null)).toEqual([]);
  });

  it("returns [] for an unparsable JSON string", () => {
    expect(normalisePermissionsColumn("{not json")).toEqual([]);
  });

  it("parses a JSON-encoded array string (PostgREST edge)", () => {
    expect(normalisePermissionsColumn('["a","b"]')).toEqual(["a", "b"]);
  });

  it("collapses duplicates and drops non-string / empty entries", () => {
    const out = normalisePermissionsColumn([
      "reseller.console",
      "reseller.console",
      "",
      "  ",
      42,
      null,
      "advisor_portal",
    ] as unknown[]);
    expect(out).toEqual(["reseller.console", "advisor_portal"]);
  });

  it("preserves insertion order", () => {
    expect(normalisePermissionsColumn(["b", "a", "c"])).toEqual(["b", "a", "c"]);
  });
});

describe("applyPermissionMutation", () => {
  it("grant appends a new known permission", () => {
    const out = applyPermissionMutation([], "grant", "reseller.console");
    expect(out).toEqual({
      next: ["reseller.console"],
      changed: true,
      was_known: true,
    });
  });

  it("grant is a no-op when the permission is already present", () => {
    const current = ["reseller.console", "advisor_portal"];
    const out = applyPermissionMutation(current, "grant", "reseller.console");
    expect(out).toEqual({
      next: current,
      changed: false,
      was_known: true,
    });
    // returns the same reference so the caller can compare cheaply
    expect(out.next).toBe(current);
  });

  it("revoke removes an existing permission", () => {
    const out = applyPermissionMutation(
      ["reseller.console", "advisor_portal", "esop.manage"],
      "revoke",
      "advisor_portal",
    );
    expect(out).toEqual({
      next: ["reseller.console", "esop.manage"],
      changed: true,
      was_known: true,
    });
  });

  it("revoke is a no-op when the permission is absent", () => {
    const current = ["reseller.console"];
    const out = applyPermissionMutation(current, "revoke", "advisor_portal");
    expect(out).toEqual({
      next: current,
      changed: false,
      was_known: true,
    });
  });

  it("flags an unknown permission via was_known=false", () => {
    const out = applyPermissionMutation([], "grant", "reports.export");
    expect(out.was_known).toBe(false);
    expect(out.changed).toBe(true);
    expect(out.next).toEqual(["reports.export"]);
  });

  it("grant preserves insertion order (append at tail)", () => {
    const out = applyPermissionMutation(
      ["a", "b", "c"],
      "grant",
      "d",
    );
    expect(out.next).toEqual(["a", "b", "c", "d"]);
  });
});
