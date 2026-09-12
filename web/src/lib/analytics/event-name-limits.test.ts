// S23-B — static GA4 limits + PII guard over every typed analytics event.
//
// GA4 silently DROPS an event whose name is > 40 chars and drops any param
// whose name is > 40 chars (https://support.google.com/analytics/answer/9267744),
// and event names must be snake_case (letters, digits, underscores; start
// with a letter) or `gtag` rejects them. Nothing at runtime tells you — the
// event just never shows up — so this test pins every event in
// `AnalyticsEventMap` (client, src/lib/analytics.ts) and `AnalyticsEvent`
// (server Measurement Protocol, src/lib/analytics/events.ts).
//
// PII guard: no event may carry a param that *looks* like a person's
// identity (`email`, `name`, `phone`, …). GA4's terms forbid sending PII and
// the CDO data principle (BlockID stores only what it needs to process the
// startup's case) forbids it too. `company_name` / `reseller_name` /
// `step_name` / `item_name` are business labels, not personal data, and are
// allowed via the suffix rule below; `user_id` is GA4's own pseudonymous key.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GA4_LIMITS } from "./ga4-dimensions";
import { parseAnalyticsEventMap, parseServerEventUnion, type EventParamTable } from "./event-map-introspect";

const LIB = path.resolve(__dirname, "..");
const client = parseAnalyticsEventMap(readFileSync(path.join(LIB, "analytics.ts"), "utf8"));
const server = parseServerEventUnion(readFileSync(path.join(LIB, "analytics", "events.ts"), "utf8"));

const SNAKE = /^[a-z][a-z0-9_]*$/;

/** Exact param names that are personal identifiers. */
const PII_EXACT = new Set([
  "email",
  "email_address",
  "name",
  "full_name",
  "first_name",
  "last_name",
  "given_name",
  "family_name",
  "surname",
  "username",
  "user_name",
  "phone",
  "phone_number",
  "mobile",
  "address",
  "street",
  "postcode",
  "zip",
  "dob",
  "date_of_birth",
  "birthday",
  "ip",
  "ip_address",
  "password",
  "ssn",
  "tfn",
  "abn_holder_name",
]);
/** Substrings that are PII regardless of prefix/suffix. */
const PII_SUBSTRINGS = ["email", "phone", "password", "passport", "licence_number", "license_number"];

function isPiiParam(p: string): boolean {
  if (PII_EXACT.has(p)) return true;
  return PII_SUBSTRINGS.some((s) => p.includes(s));
}

function checkTable(label: string, table: EventParamTable) {
  describe(label, () => {
    it("parsed a realistic number of events", () => {
      expect(table.events.size).toBeGreaterThan(10);
    });

    it(`every event name is snake_case and ≤ ${GA4_LIMITS.eventNameMax} chars`, () => {
      const bad: string[] = [];
      for (const ev of table.events.keys()) {
        if (!SNAKE.test(ev)) bad.push(`${ev}: not snake_case`);
        if (ev.length > GA4_LIMITS.eventNameMax) bad.push(`${ev}: ${ev.length} chars > ${GA4_LIMITS.eventNameMax}`);
      }
      expect(bad).toEqual([]);
    });

    it(`every param name is ≤ ${GA4_LIMITS.paramNameMax} chars and a valid identifier`, () => {
      const bad: string[] = [];
      for (const [ev, ps] of table.events) {
        for (const p of ps) {
          if (p.length > GA4_LIMITS.paramNameMax) bad.push(`${ev}.${p}: ${p.length} chars`);
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) bad.push(`${ev}.${p}: invalid identifier`);
        }
      }
      expect(bad).toEqual([]);
    });

    it("no event sends a PII-looking param (email / name / phone / …)", () => {
      const bad: string[] = [];
      for (const [ev, ps] of table.events) for (const p of ps) if (isPiiParam(p)) bad.push(`${ev}.${p}`);
      expect(bad).toEqual([]);
    });
  });
}

checkTable("AnalyticsEventMap (client gtag events)", client);
checkTable("AnalyticsEvent (server Measurement Protocol events)", server);

describe("the PII guard itself", () => {
  it("flags the obvious identifiers and lets business labels through", () => {
    for (const p of ["email", "user_email", "name", "first_name", "phone_number", "password_hash"]) expect(isPiiParam(p), p).toBe(true);
    for (const p of ["company_name", "reseller_name", "step_name", "item_name", "cta_label", "user_id", "user_id_hash", "slug"]) expect(isPiiParam(p), p).toBe(false);
  });
});
