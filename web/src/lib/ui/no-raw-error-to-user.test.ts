// S31-E static guard: no new `alert()` and no raw `err.message` /
// `error.message` / `String(err)` reaching a user surface in client code.
//
// Walks every client-side .tsx/.ts under src/app/(app) and src/components
// ("use client" directive, or a .tsx in src/components) and fails on:
//
//   1. `alert(` / `window.alert(` — browser alerts are never a UI pattern here
//      (`role="alert"` markup is fine).
//   2. `<x>.message` / `String(<x>)` where <x> is a catch-style variable
//      (err, error, e, ex, exception, cause) on a line that is not a
//      `console.*` call, a comment, a `throw`, or a `userErrorMessage(`
//      argument — i.e. it is being stored/rendered/toasted.
//
// Legitimate developer / vendor surfaces are allow-listed below with a reason.
// To add one, say why the text is safe for the person who will read it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SCAN_DIRS = [resolve(ROOT, "app/(app)"), resolve(ROOT, "components")];

// path (relative to src/) → reason
const ALLOW: Record<string, string> = {
  "app/(app)/error.tsx": "Next error boundary: error.message rendered only under NODE_ENV=development; production shows the digest",
  "app/(app)/(founder)/workspace/error.tsx": "Next error boundary: error.message rendered only under NODE_ENV=development",
  "app/(app)/(founder)/dashboard/error.tsx": "Next error boundary: error.message rendered only under NODE_ENV=development",
  "components/onboarding/step-payment.tsx": "Stripe Elements `event.error.message` / `result.error.message` are Stripe's own end-user card validation copy",
  "app/(app)/(reseller)/reseller/settings/payment-method-form.tsx": "Stripe Elements `event.error.message` / `result.error.message` are Stripe's own end-user card validation copy",
  "app/(app)/(founder)/workspace/investor/digest/page.tsx": "server component: error.message is only regex-tested for a missing-table sentinel, never rendered",
  "app/(app)/(founder)/dashboard/admin/sector-multiples/page.tsx": "founder-admin server page: migration hint for the operator, not a customer surface",
  "app/(app)/(admin)/admin/drip-stats/page.tsx": "admin-only server page: query error surfaced to the operator",
  // FOLLOW-UP (S31-E): src/components/analyze/** is owned by another agent during
  // S31; sweep these three with userErrorMessage() there and drop the entries.
  "components/analyze/analyze-root.tsx": "OWNED ELSEWHERE — intake catch shows e.message; pending the analyze agent's sweep",
  "components/analyze/guest-paid-checkout.tsx": "OWNED ELSEWHERE — startGuestCheckout throws server copy that the form re-renders; pending the analyze agent's sweep",
  "components/analyze/live-analysis-stage.tsx": "OWNED ELSEWHERE — `e` is a stream event, not an error; rename to `ev` when that tree is next touched",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

function isClientFile(file: string, src: string): boolean {
  if (/^\s*["']use client["']/m.test(src.slice(0, 400))) return true;
  // Components without the directive are still rendered client-side when imported by a client entry.
  return file.endsWith(".tsx") && file.includes(`${resolve(ROOT, "components")}/`);
}

const ALERT_RE = /(?<![\w.$])(?:window\.)?alert\s*\(/;
const RAW_RE = /\b(err|error|e|ex|exception|cause)\.message\b|\bString\((err|error|e|ex)\)/;

export function findViolations(file: string, src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\/\/.*$/, "");
    if (/^\s*(\*|\/\*)/.test(raw)) continue;
    if (ALERT_RE.test(line) && !/role=["']alert["']/.test(line)) {
      out.push(`${i + 1}: alert() — use the toast or an inline <p role="alert"> with userErrorMessage(): ${raw.trim()}`);
      continue;
    }
    if (!RAW_RE.test(line)) continue;
    if (/console\.(error|warn|info|log|debug)\(/.test(line)) continue;
    if (/^\s*throw\b/.test(line)) continue;
    if (/userErrorMessage\(|isNetworkError\(|isSafeUserCopy\(/.test(line)) continue;
    // `.message` on a non-error object named e (e.g. an SSE event) still trips
    // here on purpose — rename the variable; `e` is reserved for catch clauses.
    out.push(`${i + 1}: raw error text reaches state/JSX — wrap in userErrorMessage(err, fallback): ${raw.trim()}`);
  }
  return out;
}

describe("no raw error text reaches users (S31-E guard)", () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it("scans a meaningful number of client files", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("every alert() / err.message / String(err) in client code is wrapped or allow-listed", () => {
    const failures: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!isClientFile(file, src)) continue;
      const rel = relative(ROOT, file);
      const hits = findViolations(file, src);
      if (hits.length === 0) continue;
      if (ALLOW[rel]) continue;
      failures.push(`${rel}\n  ${hits.join("\n  ")}`);
    }
    expect(failures, failures.join("\n\n")).toEqual([]);
  });

  it("allow-list entries still exist and still need the exemption", () => {
    for (const rel of Object.keys(ALLOW)) {
      const file = resolve(ROOT, rel);
      let src: string;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        throw new Error(`ALLOW entry ${rel} no longer exists — remove it`);
      }
      expect(findViolations(file, src).length, `${rel} no longer trips the guard — drop it from ALLOW`).toBeGreaterThan(0);
    }
  });
});
