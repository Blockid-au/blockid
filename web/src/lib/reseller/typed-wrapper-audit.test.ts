// R-10 typed-wrapper-audit vitest coverage.
//
// Closes P10_hardening exit criterion "security-audit: RLS + typed wrapper
// enforced end-to-end". Locks in the analyzer's behaviour AND the current
// clean state of every /api/reseller/** route file — any future direct
// unscoped access to a reseller-scoped table breaks CI here first.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  RESELLER_SCOPED_TABLES,
  analyzeR10,
  scanResellerTableAccess,
} from "./typed-wrapper-audit";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const RESELLER_ROUTES_ROOT = resolve(
  __dirname,
  "..",
  "..",
  "app",
  "api",
  "reseller",
);

function walkTsFiles(root: string, out: string[]) {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(root, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkTsFiles(abs, out);
    else if (
      st.isFile() &&
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
    ) {
      out.push(abs);
    }
  }
}

describe("typed-wrapper-audit: canonical table list", () => {
  it("lists every reseller-scoped table shipped by migrations 0091–0106", () => {
    // Locks in the canonical set the analyzer scans for. If a new
    // reseller_* table lands (via a new migration) it MUST be added here
    // so R-10 covers it end-to-end.
    expect(RESELLER_SCOPED_TABLES).toEqual([
      "resellers",
      "reseller_admins",
      "reseller_attributions",
      "reseller_promotion_codes",
      "reseller_credit_grants",
      "reseller_requests",
      "reseller_report_files",
      "reseller_report_runs",
      "reseller_commissions",
      "reseller_events",
      "reseller_audit_log",
    ]);
  });

  it("has no duplicate entries", () => {
    const uniq = new Set(RESELLER_SCOPED_TABLES);
    expect(uniq.size).toBe(RESELLER_SCOPED_TABLES.length);
  });

  it("every entry matches the reseller_* / resellers naming convention", () => {
    for (const t of RESELLER_SCOPED_TABLES) {
      expect(t === "resellers" || t.startsWith("reseller_")).toBe(true);
    }
  });
});

describe("scanResellerTableAccess", () => {
  it("returns an empty inventory when the file touches no scoped tables", () => {
    const src = `
      const { data } = await supabase.from("app_users").select("*").eq("id", user.id);
    `;
    expect(scanResellerTableAccess("noop.ts", src)).toEqual([]);
  });

  it("finds every .from() call on a scoped table with the correct line number", () => {
    const src = [
      "// header",
      "async function run() {",
      '  await supabase.from("reseller_promotion_codes").select("*");',
      "  const other = 1;",
      '  await supabase.from("reseller_attributions").insert({ reseller_id: r });',
      "}",
    ].join("\n");
    const sites = scanResellerTableAccess("f.ts", src);
    expect(sites).toEqual([
      { file: "f.ts", line: 3, table: "reseller_promotion_codes" },
      { file: "f.ts", line: 5, table: "reseller_attributions" },
    ]);
  });

  it("does NOT confuse unscoped tables that share a substring prefix", () => {
    const src = `await supabase.from("resellerish_shadow").select();`;
    expect(scanResellerTableAccess("f.ts", src)).toEqual([]);
  });
});

describe("analyzeR10: pass paths", () => {
  it("passes when a SELECT chain includes .eq('reseller_id', ...)", () => {
    const src = [
      'await supabase.from("reseller_credit_grants")',
      '  .select("kind, amount")',
      '  .eq("reseller_id", scope.reseller_id)',
      '  .eq("month_key", key);',
    ].join("\n");
    expect(analyzeR10("f.ts", src)).toEqual([]);
  });

  it("passes when an INSERT payload contains a reseller_id key", () => {
    const src = [
      'await supabase.from("reseller_requests").insert({',
      "  reseller_id: scope.reseller_id,",
      "  requested_by: user.id,",
      '  request_type: "code_request",',
      "});",
    ].join("\n");
    expect(analyzeR10("f.ts", src)).toEqual([]);
  });

  it("treats a file-level r-01-exempt pragma as inherited justification for R-10", () => {
    const src = [
      "// r-01-exempt: public unauthenticated promotion-code lookup",
      "async function POST() {",
      '  await supabase.from("reseller_promotion_codes").select("*").eq("code", input);',
      '  await supabase.from("resellers").select("*").eq("id", promo.reseller_id);',
      "}",
    ].join("\n");
    const findings = analyzeR10("code/validate/route.ts", src);
    expect(findings.every((f) => f.severity === "exempt")).toBe(true);
    expect(findings).toHaveLength(2);
    expect(findings[0].reason).toBe("public unauthenticated promotion-code lookup");
  });

  it("accepts a per-site r-10-exempt pragma on the line above .from(...)", () => {
    const src = [
      "async function run() {",
      "  // r-10-exempt: post-insert follow-up by primary key created in same session",
      '  await supabase.from("reseller_attributions").update({...}).eq("id", newAttrId);',
      "}",
    ].join("\n");
    const findings = analyzeR10("route.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("exempt");
    expect(findings[0].reason).toContain("post-insert follow-up");
  });
});

describe("analyzeR10: violation paths", () => {
  it("flags an unscoped SELECT with no reseller_id predicate", () => {
    const src = [
      "async function run() {",
      '  await supabase.from("reseller_credit_grants").select("*");',
      "}",
    ].join("\n");
    const findings = analyzeR10("route.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].table).toBe("reseller_credit_grants");
    expect(findings[0].message).toContain("without visible reseller_id scoping");
  });

  it("flags an INSERT payload that omits reseller_id", () => {
    const src = [
      'await supabase.from("reseller_requests").insert({',
      "  requested_by: user.id,",
      '  request_type: "code_request",',
      "});",
    ].join("\n");
    const findings = analyzeR10("route.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  it("rejects an empty r-10-exempt pragma reason", () => {
    const src = [
      "// r-10-exempt:",
      'await supabase.from("resellers").select("*").eq("id", something);',
    ].join("\n");
    const findings = analyzeR10("route.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("non-empty reason");
  });

  it("rejects an empty r-01-exempt file-level pragma reason", () => {
    const src = [
      "// r-01-exempt:",
      'await supabase.from("resellers").select("*").eq("id", something);',
    ].join("\n");
    const findings = analyzeR10("route.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("reason must be non-empty");
  });
});

describe("analyzeR10: live /api/reseller/** attestation", () => {
  const files: string[] = [];
  walkTsFiles(RESELLER_ROUTES_ROOT, files);

  it("scans at least the 11 known route files (drift-detector)", () => {
    // If this count changes, the audit surface has grown; the new routes
    // must land clean under R-10 too (the exemption/scoping census below
    // will catch any drift automatically).
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it("every direct scoped-table access site carries visible scoping OR an authored exemption", () => {
    const errors: Array<{ file: string; line: number; message: string }> = [];
    const exemptions: Array<{ file: string; line: number; reason: string }> = [];
    for (const abs of files) {
      const rel = relative(REPO_ROOT, abs);
      const content = readFileSync(abs, "utf8");
      for (const f of analyzeR10(rel, content)) {
        if (f.severity === "error") {
          errors.push({ file: f.file, line: f.line, message: f.message });
        } else if (f.reason) {
          exemptions.push({ file: f.file, line: f.line, reason: f.reason });
        }
      }
    }
    // Zero R-10 violations across the live surface.
    expect(errors).toEqual([]);
    // Sanity check: at least a few exemptions exist (public code/validate
    // route + the /me self-lookup), otherwise the file-level r-01 inheritance
    // path is unexercised and we would be scanning nothing meaningful.
    expect(exemptions.length).toBeGreaterThanOrEqual(2);
  });
});
