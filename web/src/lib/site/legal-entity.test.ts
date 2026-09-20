// Guard for the canonical legal identity (G21 P0-A).
//
// Two jobs:
//   1. Pin the helpers — every line the site, PDFs, e-mails and JSON-LD
//      derive from `LEGAL_ENTITY` has one expected shape, and the token
//      filler resolves both the i18n `{entityX}` and the MDX
//      `{{LEGAL_ENTITY.x}}` spellings.
//   2. Walk `src/**` (and the i18n catalogues + `content/legal`) and fail on
//      any file that still carries the operator, marketing operator, ACN or
//      ABN as a literal. Tests and this config are the only places allowed
//      to spell them out, so a future page cannot drift from the config.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  BRAND_SITE,
  ENTITY_TOKENS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_ABN_LABEL,
  LEGAL_ENTITY_ACN_LABEL,
  LEGAL_ENTITY_SHORT_NAME,
  acnAbnLine,
  fillEntityTokens,
  legalLine,
  marketingLine,
  producedByLine,
  sellerOfRecordLine,
  statutoryLine,
  tradingAsLine,
  trustRows,
} from "./legal-entity";

// ---------------------------------------------------------------------------
// 1. Helpers
// ---------------------------------------------------------------------------

describe("LEGAL_ENTITY — the one source of company identity", () => {
  it("names the seller of record with a valid ACN / ABN pair and the marketing operator", () => {
    expect(LEGAL_ENTITY.operator).toMatch(/PTY LTD$/);
    expect(LEGAL_ENTITY.acn).toMatch(/^\d{3} \d{3} \d{3}$/);
    expect(LEGAL_ENTITY.abn).toMatch(/^\d{2} \d{3} \d{3} \d{3}$/);
    // The ABN is the ACN with a two-digit prefix (ASIC-registered companies).
    expect(LEGAL_ENTITY.abn.slice(3)).toBe(LEGAL_ENTITY.acn);
    expect(LEGAL_ENTITY.marketingOperator.length).toBeGreaterThan(0);
    for (const key of ["privacyOwner", "termsOwner", "invoiceEntity", "stripeMerchant", "copyrightHolder"] as const) {
      expect(LEGAL_ENTITY[key], key).toBe(LEGAL_ENTITY.operator);
    }
  });

  it("labels and derived lines are built from the object, in the documented shapes", () => {
    expect(LEGAL_ENTITY_ACN_LABEL).toBe(`ACN ${LEGAL_ENTITY.acn}`);
    expect(LEGAL_ENTITY_ABN_LABEL).toBe(`ABN ${LEGAL_ENTITY.abn}`);
    expect(LEGAL_ENTITY_SHORT_NAME).toBe(LEGAL_ENTITY.operator.replace(/\s+PTY\s+LTD$/i, ""));
    expect(BRAND_SITE).toBe(`${LEGAL_ENTITY.brand}.au`);
    expect(legalLine()).toBe(`${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ACN_LABEL}, ${LEGAL_ENTITY_ABN_LABEL})`);
    expect(sellerOfRecordLine()).toBe(`${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ABN_LABEL} · ${LEGAL_ENTITY.city}`);
    expect(acnAbnLine()).toBe(`${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_ACN_LABEL} · ${LEGAL_ENTITY_ABN_LABEL}`);
    expect(statutoryLine()).toBe(`${acnAbnLine()} · ${LEGAL_ENTITY.city}`);
    expect(producedByLine()).toBe(`${BRAND_SITE} (${LEGAL_ENTITY.operator}, ${LEGAL_ENTITY_ACN_LABEL}, ${LEGAL_ENTITY_ABN_LABEL})`);
    expect(tradingAsLine()).toBe(`${LEGAL_ENTITY.operator} trading as ${BRAND_SITE}`);
  });

  it("marketingLine() names both roles explicitly (marketing operator + seller of record with ABN)", () => {
    const line = marketingLine(2026);
    expect(line.startsWith("© 2026 ")).toBe(true);
    expect(line).toContain(LEGAL_ENTITY.operator);
    expect(line).toContain(LEGAL_ENTITY_ABN_LABEL);
    expect(line).toContain(LEGAL_ENTITY.city);
    if (LEGAL_ENTITY.marketingOperator !== (LEGAL_ENTITY.operator as string)) {
      expect(line).toContain(`built by ${LEGAL_ENTITY.marketingOperator}`);
      expect(line).toContain("Billing, legal and invoices:");
    }
    expect(marketingLine()).toContain(`© ${new Date().getFullYear()} `);
  });

  it("trustRows() carries entity, ACN/ABN, the methodology version and support — in that order", () => {
    const rows = trustRows("2.2.0");
    expect(rows.map((r) => r.label)).toEqual(["Operating entity", "ACN / ABN", "Methodology version", "Support"]);
    expect(rows[0]!.value).toBe(`${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY.jurisdiction}`);
    expect(rows[1]!.value).toBe(`${LEGAL_ENTITY_ACN_LABEL} · ${LEGAL_ENTITY_ABN_LABEL}`);
    expect(rows[2]!.value).toBe("Startup Value Index v2.2.0");
    expect(rows[3]!.value).toBe(LEGAL_ENTITY.supportEmail);
  });

  it("fillEntityTokens() resolves both token spellings and leaves unknown tokens visible", () => {
    expect(fillEntityTokens("Run by {entityOperator} ({entityAbnLabel}) in {entityCity}.")).toBe(
      `Run by ${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ABN_LABEL}) in ${LEGAL_ENTITY.city}.`,
    );
    expect(fillEntityTokens("{{LEGAL_ENTITY.operator}} · {{ LEGAL_ENTITY.short }}")).toBe(
      `${LEGAL_ENTITY.operator} · ${LEGAL_ENTITY_SHORT_NAME}`,
    );
    expect(fillEntityTokens("{entityStatutoryLine}")).toBe(statutoryLine());
    expect(fillEntityTokens("{entitySellerLine}")).toBe(sellerOfRecordLine());
    expect(fillEntityTokens("{entityNope} {{LEGAL_ENTITY.nope}} {firmPrice}")).toBe(
      "{entityNope} {{LEGAL_ENTITY.nope}} {firmPrice}",
    );
    for (const value of Object.values(ENTITY_TOKENS)) expect(value.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. No stray literals outside this config
// ---------------------------------------------------------------------------

const WEB_ROOT = resolve(__dirname, "../../..");
const SCAN_TREES = ["src", "content/legal"];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|mdx)$/;
const SELF = "src/lib/site/legal-entity.ts";

/**
 * Files another G21 lane owns that still carry a literal. Each entry is a
 * debt with an owner — delete the row when that lane imports the config, so
 * the guard tightens to zero. Nothing may be added here for convenience.
 */
const OTHER_LANE_DEBT: ReadonlySet<string> = new Set([
  // P0-C (Stripe invoice footer + Seller ABN custom field on the checkout route).
  "src/app/api/stripe/checkout/route.ts",
]);

/** The literals nothing outside the config may spell out (case-insensitive). */
const FORBIDDEN: readonly RegExp[] = [
  new RegExp(LEGAL_ENTITY_SHORT_NAME, "i"), // the operator, any casing / suffix
  new RegExp(LEGAL_ENTITY.marketingOperator.replace(/\s+PTY\s+LTD$/i, ""), "i"),
  new RegExp(LEGAL_ENTITY.acn), // "659 615 111" — also inside the ABN
  new RegExp(LEGAL_ENTITY.acn.replace(/ /g, "")), // "659615111" — also inside the compact ABN
];

function walk(path: string, out: string[]): void {
  const st = statSync(path);
  if (st.isFile()) {
    if (SOURCE_EXT.test(path) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) out.push(path);
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === ".next") continue;
    walk(join(path, entry), out);
  }
}

describe("no entity literal outside lib/site/legal-entity.ts", () => {
  const files: string[] = [];
  for (const tree of SCAN_TREES) walk(resolve(WEB_ROOT, tree), files);

  it("walks the source tree (a moved tree must be re-pointed here, not silently dropped)", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith("/messages/en.json"))).toBe(true);
    expect(files.some((f) => f.endsWith("/privacy-v2.mdx"))).toBe(true);
  });

  it("every literal lives in the config — pages, PDFs, e-mails, JSON-LD, catalogues and legal MDX derive from it", () => {
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relative(WEB_ROOT, abs);
      if (rel === SELF || OTHER_LANE_DEBT.has(rel)) continue;
      const text = readFileSync(abs, "utf8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        for (const re of FORBIDDEN) {
          if (re.test(line)) {
            offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
            break;
          }
        }
      });
    }
    expect(offenders, `import from @/lib/site/legal-entity instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
