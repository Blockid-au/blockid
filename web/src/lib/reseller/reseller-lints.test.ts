import { describe, expect, it } from "vitest";
import { analyzeR01 } from "./reseller-lints";

const F = "web/src/app/api/reseller/example/route.ts";

describe("analyzeR01", () => {
  it("passes files that do not touch getSupabaseAdmin", () => {
    const src = `
      import { NextResponse } from "next/server";
      export async function GET() { return NextResponse.json({ ok: true }); }
    `;
    expect(analyzeR01(F, src)).toEqual([]);
  });

  it("passes when scopedReseller is imported via alias", () => {
    const src = `
      import { getSupabaseAdmin } from "@/lib/supabase";
      import { scopedReseller } from "@/lib/reseller/scope";
      export async function GET() { getSupabaseAdmin(); scopedReseller; }
    `;
    expect(analyzeR01(F, src)).toEqual([]);
  });

  it("passes when resellerSupabase wrapper is imported via alias", () => {
    const src = `
      import { getSupabaseAdmin } from "@/lib/supabase";
      import { resellerSupabase } from "@/lib/reseller/supabase";
      export async function GET() { getSupabaseAdmin(); resellerSupabase; }
    `;
    expect(analyzeR01(F, src)).toEqual([]);
  });

  it("passes when scope helper is imported via relative path", () => {
    const src = `
      import { getSupabaseAdmin } from "../../../../lib/supabase";
      import { scopedReseller } from "../../../../lib/reseller/scope";
    `;
    expect(analyzeR01(F, src)).toEqual([]);
  });

  it("flags files that use getSupabaseAdmin without either import", () => {
    const src = [
      `import { getSupabaseAdmin } from "@/lib/supabase";`,
      `export async function GET() { const db = getSupabaseAdmin(); return db; }`,
    ].join("\n");
    const findings = analyzeR01(F, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].line).toBe(1);
    expect(findings[0].message).toMatch(/R-01/);
    expect(findings[0].message).toMatch(/scopedReseller/);
    expect(findings[0].message).toMatch(/resellerSupabase/);
  });

  it("does not match unrelated identifiers containing substrings", () => {
    const src = `
      const notGetSupabaseAdminHelper = 1;
      const noMatch = "getSupabaseAdminButAString";
    `;
    // `getSupabaseAdminButAString` still contains \bgetSupabaseAdmin\b at
    // a word boundary followed by letters — no, actually /\b/ requires a
    // transition, and letters after the token means no right-boundary. So
    // this must NOT match. Assert to lock the behaviour in.
    expect(analyzeR01(F, src)).toEqual([]);
  });

  it("honours an r-01-exempt pragma with a non-empty reason", () => {
    const src = [
      `// r-01-exempt: public unauthenticated code validator (no user context)`,
      `import { getSupabaseAdmin } from "@/lib/supabase";`,
      `export async function POST() { getSupabaseAdmin(); }`,
    ].join("\n");
    const findings = analyzeR01(F, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("exempt");
    expect(findings[0].line).toBe(1);
    expect(findings[0].reason).toBe(
      "public unauthenticated code validator (no user context)",
    );
  });

  it("rejects an r-01-exempt pragma without a reason", () => {
    const src = [
      `// r-01-exempt:`,
      `import { getSupabaseAdmin } from "@/lib/supabase";`,
      `export async function POST() { getSupabaseAdmin(); }`,
    ].join("\n");
    const findings = analyzeR01(F, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/non-empty reason/);
    expect(findings[0].line).toBe(1);
  });

  it("prefers exemption over the missing-import error when both apply", () => {
    const src = [
      `import { getSupabaseAdmin } from "@/lib/supabase";`,
      `// r-01-exempt: reads only current session's own row`,
      `export async function GET() { getSupabaseAdmin(); }`,
    ].join("\n");
    const findings = analyzeR01(F, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("exempt");
  });
});
