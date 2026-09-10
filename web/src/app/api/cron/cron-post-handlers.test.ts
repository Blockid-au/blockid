/**
 * Every cron route must answer POST.
 *
 * scripts/cron-runner.sh calls each endpoint with `curl -X POST`. A route that
 * exports only GET answers 405, and the failure is close to invisible: a 405
 * has an empty body, so cron-health.jsonl records `"detail": ""` with no clue
 * what went wrong.
 *
 * Five scheduled jobs were dead this way — dunning-retry (failed-payment
 * retries, every 6h), refresh-sector-benchmarks (the job that keeps valuation
 * multiples current), nightly-clevel-review, weekly-metrics and
 * weekly-retention — for as long as anyone can tell from the logs.
 *
 * The convention is `export { GET as POST };` at the end of the file. This
 * test enforces it by reading the source rather than importing, because
 * importing a cron route pulls in its whole dependency graph (and at least one
 * of them calls process.exit on import).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CRON_DIR = join(process.cwd(), "src/app/api/cron");

function routeFiles(): Array<{ endpoint: string; source: string }> {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ endpoint: e.name, file: join(CRON_DIR, e.name, "route.ts") }))
    .filter((r) => existsSync(r.file))
    .map((r) => ({ endpoint: r.endpoint, source: readFileSync(r.file, "utf8") }));
}

describe("cron routes accept POST", () => {
  it("finds the cron routes at all (guards against a silent empty sweep)", () => {
    expect(routeFiles().length).toBeGreaterThan(50);
  });

  it("every cron route exports a POST handler", () => {
    const missing = routeFiles()
      .filter(({ source }) => {
        const hasOwnPost = /export\s+(async\s+)?function\s+POST\b/.test(source);
        const aliased = /export\s*\{[^}]*\bGET\s+as\s+POST\b[^}]*\}/.test(source);
        const assigned = /export\s+const\s+POST\s*=\s*GET\b/.test(source);
        return !(hasOwnPost || aliased || assigned);
      })
      .map((r) => r.endpoint);

    expect(
      missing,
      `These cron routes do not export POST, so cron-runner.sh gets 405 and ` +
        `the job silently does nothing:\n  ${missing.join("\n  ")}\n` +
        `Add "export { GET as POST };" to each.`,
    ).toEqual([]);
  });
});
