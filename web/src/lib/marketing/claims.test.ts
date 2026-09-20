// G21 P0-D — public claims guard (docs/design/public-claims-policy.md).
//
// Walks the marketing trees (CLAIM_TREES), extracts every quantified claim
// with the conservative extractor in ./claims.ts and fails when a claim is
// not in content/claims-register.json. Prices are skipped (pricing-truth.md
// + stripe-map.test.ts govern them). To register a claim, add a row whose
// `patterns` contains the normalised token printed in the failure.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  CLAIM_CLASSES,
  CLAIM_EXCLUDED_PREFIXES,
  CLAIM_TREES,
  claimIndex,
  claimsOfClass,
  claimsRegisterSchema,
  extractClaims,
  messageCatalogueCopy,
  normaliseClaim,
  stripNonCopy,
  type ClaimRow,
} from "./claims";

const WEB_ROOT = resolve(__dirname, "../../..");
const REGISTER_PATH = resolve(WEB_ROOT, "content/claims-register.json");
const POLICY_PATH = resolve(WEB_ROOT, "../docs/design/public-claims-policy.md");

const register = claimsRegisterSchema.parse(JSON.parse(readFileSync(REGISTER_PATH, "utf8"))) as ClaimRow[];
const index = claimIndex(register);

function walk(path: string, out: string[]): void {
  const st = statSync(path);
  if (st.isFile()) {
    if (/\.(tsx?|json)$/.test(path) && !/\.(test|spec)\./.test(path)) out.push(path);
    return;
  }
  for (const entry of readdirSync(path)) walk(join(path, entry), out);
}

const files: string[] = [];
for (const tree of CLAIM_TREES) walk(resolve(WEB_ROOT, tree), files);

const corpus = files
  .map((abs) => ({ rel: relative(WEB_ROOT, abs), abs }))
  .filter(({ rel }) => !CLAIM_EXCLUDED_PREFIXES.some((p) => rel.startsWith(p)))
  .map(({ rel, abs }) => {
    const raw = readFileSync(abs, "utf8");
    return { rel, text: rel.endsWith(".json") ? messageCatalogueCopy(raw) : stripNonCopy(raw) };
  });

describe("extractor (pure)", () => {
  it("normalises case, spacing, × and thousands separators", () => {
    expect(normaliseClaim("Eight  dimensions")).toBe("eight dimensions");
    expect(normaliseClaim("8 × 13")).toBe("8 x 13");
    expect(normaliseClaim("3,302 snapshots")).toBe("3302 snapshots");
    expect(normaliseClaim("~2 minutes")).toBe("2 minutes");
    expect(normaliseClaim("8-dimension")).toBe("8 dimension");
  });

  it("finds percentages, counts, time-to-value, multiples and spelled-out counts", () => {
    const hits = extractClaims("Score any startup in 60 seconds.\nEight dimensions, 13 criteria, 99.9% uptime, 8 × 13.");
    expect(hits.map((h) => h.token).sort()).toEqual(["13 criteria", "60 seconds", "8 x", "99.9%", "eight dimensions", "in 60 seconds"]);
    expect(hits.filter((h) => h.line === 1).map((h) => h.token).sort()).toEqual(["60 seconds", "in 60 seconds"]);
  });

  it("skips prices, CSS values, comments and import lines", () => {
    const src = [
      'import { x } from "y"; // 60 seconds',
      "/* 8 dimensions in a comment */",
      'const a = "A$3 per report, A$149 startup package";',
      '<div className="w-[50%] bg-[radial-gradient(60%_40%)]" style="width: 30%" />',
      '"radial-gradient(ellipse 60% 40% at 50% 0%, transparent 70%)"',
    ].join("\n");
    expect(extractClaims(stripNonCopy(src))).toEqual([]);
  });

  it("reads only the values of a message catalogue and drops _comment keys", () => {
    const json = '{\n  "_comment.x": "8 dimensions",\n  "hero.a": "eight dimensions",\n  "n": 1\n}';
    const copy = messageCatalogueCopy(json);
    expect(copy.split("\n")).toHaveLength(5);
    expect(extractClaims(copy).map((h) => `${h.line}:${h.token}`)).toEqual(["3:eight dimensions"]);
  });
});

describe("content/claims-register.json", () => {
  it("validates, has unique ids and unique patterns, and every class is one of the three", () => {
    const ids = new Set<string>();
    const patterns = new Set<string>();
    for (const row of register) {
      expect(ids.has(row.id), `duplicate id ${row.id}`).toBe(false);
      ids.add(row.id);
      expect(CLAIM_CLASSES).toContain(row.class);
      for (const p of row.patterns) {
        const n = normaliseClaim(p);
        expect(patterns.has(n), `pattern "${p}" appears on two rows`).toBe(false);
        patterns.add(n);
      }
    }
    expect(register.length).toBeGreaterThanOrEqual(20);
  });

  it("no hypothesis is worded as traction (the policy's never-say words)", () => {
    for (const row of claimsOfClass(register, "hypothesis")) {
      expect(row.claim, row.id).not.toMatch(/\b(trusted by|customers use|proven|guaranteed)\b/i);
    }
  });

  it("every register row is still used by at least one public surface (no stale rows)", () => {
    const seen = new Set<string>();
    for (const { text } of corpus) for (const h of extractClaims(text)) seen.add(h.token);
    const stale = register.filter((r) => !r.patterns.some((p) => seen.has(normaliseClaim(p)))).map((r) => r.id);
    expect(stale, "remove or re-point rows whose patterns no longer appear on any public surface").toEqual([]);
  });

  it("the policy document exists and names the three classes", () => {
    const policy = readFileSync(POLICY_PATH, "utf8");
    for (const c of CLAIM_CLASSES) expect(policy.toLowerCase()).toContain(c);
    expect(policy).toContain("claims-register.json");
  });
});

describe("every quantified claim on a public surface is registered", () => {
  it("scans the marketing trees", () => {
    expect(corpus.length).toBeGreaterThan(80);
  });

  it("finds no unregistered claim", () => {
    const missing: string[] = [];
    for (const { rel, text } of corpus) {
      for (const h of extractClaims(text)) {
        if (!index.has(h.token)) missing.push(`${rel}:${h.line}: "${h.text}" → token "${h.token}"`);
      }
    }
    expect(missing, "add a row (or a pattern) to content/claims-register.json — see docs/design/public-claims-policy.md").toEqual([]);
  });
});
