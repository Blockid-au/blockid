// Helpers for /api/cron/bq-export kept outside route.ts (Next only allows
// handler exports from a route module).
import { existsSync } from "node:fs";
import path from "node:path";

// The live server runs from a standalone release directory (no devDeps, no
// `tsx`), so resolve the script and the tsx CLI from the source checkout —
// same convention as agent-deploy / agent-auto-improve.
export const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";

export function resolveScript(cwd = process.cwd()): { scriptPath: string; tsxCli: string | null } {
  const local = path.resolve(cwd, cwd.endsWith(`${path.sep}web`) ? "scripts/bq-export-events.ts" : "web/scripts/bq-export-events.ts");
  const scriptPath = existsSync(local) ? local : path.join(WEB_DIR, "scripts/bq-export-events.ts");
  const candidates = [path.resolve(cwd, "node_modules/tsx/dist/cli.mjs"), path.join(WEB_DIR, "node_modules/tsx/dist/cli.mjs")];
  const tsxCli = candidates.find((c) => existsSync(c)) ?? null;
  return { scriptPath, tsxCli };
}

/** BigQuery is a deferred integration: without a project id the sweep is a no-op, not a failure. */
export function bqConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BQ_PROJECT_ID?.trim());
}

