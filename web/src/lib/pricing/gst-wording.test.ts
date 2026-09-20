// G18-A (2026-09-19) — one GST rule for every surface (plans-v2 GST_SUFFIX /
// GST_POLICY_LINE). Greps web/src (non-test) for the retired spellings so a
// new "A$3 inc-GST" or "GST included" cannot land silently. The ATO
// tax-invoice checker (third-party invoice language) and "+ GST" competitor
// quotes are exempt by path / pattern.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GST_POLICY_LINE, GST_SUFFIX, withGst } from "@/lib/plans-v2";
import { trustReportPriceLabelLong } from "@/lib/pricing/trust-report-price";

const SRC = join(__dirname, "..", "..");
const EXEMPT_PATH = [
  "tax-invoice-checker",
  `${join("lib", "compliance")}`,
  "stripe-price-catalogue.json",
  "plans.generated.ts",
  "gst-wording.test.ts",
];
const RETIRED = [/\binc-GST\b/, /\bincl\. GST\b/, /\bGST-incl\./, /(?<![.\w])\binc GST\b/, /\bGST included\b/, /\bGST inclusive\b/];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(p);
    } else if (/\.(tsx?|json|mdx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      yield p;
    }
  }
}

describe("GST wording — one spelling after an amount, one policy sentence", () => {
  it("helpers produce the canonical forms", () => {
    expect(GST_SUFFIX).toBe("inc. GST");
    expect(withGst("A$3")).toBe("A$3 inc. GST");
    expect(trustReportPriceLabelLong()).toBe("A$3 inc. GST");
    expect(GST_POLICY_LINE).toBe("AUD pricing, GST-inclusive. Every charge produces an ATO tax invoice.");
  });

  it("no retired spelling survives in web/src (non-test) outside the invoice-checker exemptions", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (EXEMPT_PATH.some((e) => file.includes(e))) continue;
      const text = readFileSync(file, "utf8");
      text.split("\n").forEach((line, i) => {
        for (const rx of RETIRED) {
          if (rx.test(line)) offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
