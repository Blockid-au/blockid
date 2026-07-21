import { describe, expect, it } from "vitest";
import {
  buildSandboxProjectInsert,
  canProvisionSandbox,
} from "./sandbox-provision";

const base = {
  reseller_id: "11111111-1111-1111-1111-111111111111",
  reseller_code: "INFOVISION",
  reseller_display_name: "InfoVision",
  user_id: "22222222-2222-2222-2222-222222222222",
};

describe("buildSandboxProjectInsert", () => {
  it("emits the sandbox-prefixed slug so it cannot collide with user projects", () => {
    const row = buildSandboxProjectInsert(base);
    expect(row.slug).toBe("reseller-sandbox-infovision");
    expect(row.slug.startsWith("reseller-sandbox-")).toBe(true);
  });

  it("uses the display name in the human-readable project name", () => {
    expect(buildSandboxProjectInsert(base).name).toBe("InfoVision Sandbox");
  });

  it("stamps reseller_sandbox_id so scope.sandboxProjectId() can find it", () => {
    expect(buildSandboxProjectInsert(base).reseller_sandbox_id).toBe(
      base.reseller_id,
    );
  });

  it("never marks the sandbox as the user's default project", () => {
    expect(buildSandboxProjectInsert(base).is_default).toBe(false);
  });

  it("sanitises codes with punctuation into a URL-safe slug segment", () => {
    const row = buildSandboxProjectInsert({
      ...base,
      reseller_code: "Acme_Co! 2026",
    });
    expect(row.slug).toBe("reseller-sandbox-acme-co-2026");
  });

  it("falls back to the code when display_name is blank", () => {
    const row = buildSandboxProjectInsert({
      ...base,
      reseller_display_name: "   ",
    });
    expect(row.name).toBe("INFOVISION Sandbox");
  });

  it("clamps a pathological code length to 40 characters after prefix", () => {
    const long = "A".repeat(200);
    const row = buildSandboxProjectInsert({ ...base, reseller_code: long });
    const suffix = row.slug.replace("reseller-sandbox-", "");
    expect(suffix.length).toBe(40);
  });

  it("emits a description explaining the sandbox billing model", () => {
    const row = buildSandboxProjectInsert(base);
    expect(row.description).toMatch(/monthly_credit_budget/);
  });
});

describe("canProvisionSandbox", () => {
  it("allows owners", () => {
    expect(canProvisionSandbox("owner")).toBe(true);
  });
  it("allows admins", () => {
    expect(canProvisionSandbox("admin")).toBe(true);
  });
  it("blocks viewers — provisioning creates billable capacity", () => {
    expect(canProvisionSandbox("viewer")).toBe(false);
  });
});
