import { describe, expect, it } from "vitest";
import { analyzeR01, analyzeR03, analyzeR04 } from "./reseller-lints";

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

const G = "web/src/app/api/cap-table/route.ts";

describe("analyzeR03", () => {
  it("returns nothing when the file has no mutation handler", () => {
    const src = `
      export async function GET() { return null; }
    `;
    expect(analyzeR03(G, src, "share_management")).toEqual([]);
  });

  it("passes a handler that invokes gateRequireFeature with the manifest key", () => {
    const src = [
      `import { gateRequireFeature } from "@/lib/feature-gate";`,
      `export async function POST() {`,
      `  const gate = await gateRequireFeature("share_management");`,
      `  if (!gate.ok) return gate.response;`,
      `}`,
    ].join("\n");
    expect(analyzeR03(G, src, "share_management")).toEqual([]);
  });

  it("passes when requireFeature is called directly with the key", () => {
    const src = [
      `import { requireFeature } from "@/lib/entitlements";`,
      `export async function POST() {`,
      `  await requireFeature(user, "share_management");`,
      `}`,
    ].join("\n");
    expect(analyzeR03(G, src, "share_management")).toEqual([]);
  });

  it("flags a handler that never gates", () => {
    const src = [
      `export async function POST() {`,
      `  return 1;`,
      `}`,
    ].join("\n");
    const findings = analyzeR03(G, src, "share_management");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].method).toBe("POST");
    expect(findings[0].message).toMatch(/share_management/);
  });

  it("flags a handler that gates the WRONG feature key", () => {
    const src = [
      `import { gateRequireFeature } from "@/lib/feature-gate";`,
      `export async function POST() {`,
      `  const gate = await gateRequireFeature("vesting.write");`,
      `  if (!gate.ok) return gate.response;`,
      `}`,
    ].join("\n");
    const findings = analyzeR03(G, src, "share_management");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  it("checks every mutation handler independently", () => {
    const src = [
      `import { gateRequireFeature } from "@/lib/feature-gate";`,
      `export async function POST() {`,
      `  const gate = await gateRequireFeature("share_management");`,
      `  if (!gate.ok) return gate.response;`,
      `}`,
      `export async function DELETE() {`,
      `  return 1;`,
      `}`,
    ].join("\n");
    const findings = analyzeR03(G, src, "share_management");
    expect(findings).toHaveLength(1);
    expect(findings[0].method).toBe("DELETE");
  });

  it("honours an r-03-exempt pragma with a non-empty reason", () => {
    const src = [
      `// r-03-exempt: investor engagement telemetry from anonymous view`,
      `export async function POST() { return 1; }`,
    ].join("\n");
    const findings = analyzeR03(G, src, "share_management");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("exempt");
    expect(findings[0].method).toBe("POST");
    expect(findings[0].reason).toBe(
      "investor engagement telemetry from anonymous view",
    );
  });

  it("rejects an r-03-exempt pragma without a reason", () => {
    const src = [
      `// r-03-exempt:`,
      `export async function POST() { return 1; }`,
    ].join("\n");
    const findings = analyzeR03(G, src, "share_management");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/non-empty reason/);
  });

  it("supports async and non-async function signatures", () => {
    const src = [
      `import { gateRequireFeature } from "@/lib/feature-gate";`,
      `export function PATCH() {`,
      `  const gate = gateRequireFeature("share_management");`,
      `  return gate;`,
      `}`,
    ].join("\n");
    expect(analyzeR03(G, src, "share_management")).toEqual([]);
  });
});

const S = "web/src/app/api/stripe/checkout/route.ts";
const NON_STRIPE = "web/src/app/api/reseller/foo/route.ts";

describe("analyzeR04", () => {
  it("ignores files outside web/src/app/api/stripe/", () => {
    const src = [
      `metadata: {`,
      `  blockid_user_id: user.id,`,
      `}`,
    ].join("\n");
    expect(analyzeR04(NON_STRIPE, src)).toEqual([]);
  });

  it("passes when the raw UUID value is wrapped in hashUserId()", () => {
    const src = [
      `sessionParams.metadata = {`,
      `  blockid_user_id: hashUserId(user.id),`,
      `  blockid_plan: planId,`,
      `};`,
    ].join("\n");
    expect(analyzeR04(S, src)).toEqual([]);
  });

  it("passes when a peer `_hash` field accompanies the raw entry (transition)", () => {
    const src = [
      `metadata: {`,
      `  blockid_user_id: user.id,`,
      `  blockid_user_hash: hashUserId(user.id),`,
      `  blockid_plan: planId,`,
      `};`,
    ].join("\n");
    expect(analyzeR04(S, src)).toEqual([]);
  });

  it("flags a raw `.id` write with no hash sibling and no exempt pragma", () => {
    const src = [
      `sessionParams.metadata = {`,
      `  blockid_user_id: user.id,`,
      `  blockid_plan: planId,`,
      `};`,
    ].join("\n");
    const findings = analyzeR04(S, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/R-04/);
    expect(findings[0].message).toMatch(/hashUserId/);
  });

  it("flags a raw `.reseller_id` write with no hash sibling", () => {
    const src = [
      `metadata: {`,
      `  reseller_id: promo.reseller_id,`,
      `  reseller_code: promo.code,`,
      `};`,
    ].join("\n");
    const findings = analyzeR04(S, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  it("honours an r-04-exempt pragma with a non-empty reason", () => {
    const src = [
      `// r-04-exempt: transition — raw kept for webhook back-compat`,
      `metadata: {`,
      `  blockid_user_id: user.id,`,
      `};`,
    ].join("\n");
    const findings = analyzeR04(S, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("exempt");
    expect(findings[0].reason).toBe(
      "transition — raw kept for webhook back-compat",
    );
  });

  it("rejects an r-04-exempt pragma without a reason", () => {
    const src = [
      `// r-04-exempt:`,
      `metadata: {`,
      `  blockid_user_id: user.id,`,
      `};`,
    ].join("\n");
    const findings = analyzeR04(S, src);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/non-empty reason/);
  });

  it("ignores non-id string-literal metadata entries", () => {
    const src = [
      `metadata: {`,
      `  blockid_plan: "growth",`,
      `  blockid_email: email,`,
      `  blockid_type: "svi_analysis",`,
      `};`,
    ].join("\n");
    expect(analyzeR04(S, src)).toEqual([]);
  });

  it("handles nested object literals inside the metadata block", () => {
    const src = [
      `subscription_data: {`,
      `  metadata: {`,
      `    blockid_user_id: hashUserId(user.id),`,
      `    nested: { note: "safe" },`,
      `  },`,
      `};`,
    ].join("\n");
    expect(analyzeR04(S, src)).toEqual([]);
  });
});
