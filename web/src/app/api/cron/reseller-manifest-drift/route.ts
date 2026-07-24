// GET /api/cron/reseller-manifest-drift
//
// R-09 (docs/plans/reseller-module-plan.md § U.15.12) — nightly runtime
// check that the on-disk feature-gate surface matches
// web/src/lib/feature-gates.manifest.ts. The completeness vitest suite at
// web/src/lib/feature-gates.manifest.test.ts catches drift at CI time; this
// endpoint catches drift merged past CI (hand edits on the server, a route
// file added out-of-band, a manifest entry left behind after a delete) and
// emails admin@blockid.au before the next release cycle ships an ungated
// mutation route.
//
// Behaviour:
//   1. Walk every directory in GATED_DIRECTORIES under web/src/app/ for
//      route.ts files, and for each detect whether any MUTATION_METHODS
//      handler is exported.
//   2. Hand the discovered list + FEATURE_GATES to detectManifestDrift().
//   3. If drift, email admin@blockid.au with the formatted body; either way
//      return the drift payload as JSON.
//   4. `?skip_email=1` supports dry-run; `?force_email=1` forces the email
//      even on a clean report (useful for cron-health probes).
//
// Auth: shared CRON_SECRET bearer pattern used by every other reseller-*
// cron route. When CRON_SECRET is unset the endpoint accepts any request —
// matches sibling posture.

import { NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { sendEmail } from "@/lib/email";
import {
  FEATURE_GATES,
  GATED_DIRECTORIES,
  MUTATION_METHODS,
} from "@/lib/feature-gates.manifest";
import {
  detectManifestDrift,
  formatManifestDriftEmail,
  type DiscoveredRoute,
} from "@/lib/reseller/manifest-drift";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@blockid.au";

function findAppRoot(): string {
  // process.cwd() when Next runs is the `web/` directory.
  return path.resolve(process.cwd(), "src", "app");
}

function walkRouteFiles(appRoot: string, rootRelative: string): string[] {
  const start = path.join(appRoot, rootRelative);
  const out: string[] = [];
  const stack: string[] = [start];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && name === "route.ts") {
        out.push(path.relative(appRoot, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

function detectMutation(absPath: string): boolean {
  let src: string;
  try {
    src = readFileSync(absPath, "utf8");
  } catch {
    return false;
  }
  for (const verb of MUTATION_METHODS) {
    const direct = new RegExp(`export\\s+(async\\s+)?function\\s+${verb}\\b`);
    if (direct.test(src)) return true;
    const reexport = new RegExp(`export\\s*\\{[^}]*\\b${verb}\\b[^}]*\\}`);
    if (reexport.test(src)) return true;
  }
  return false;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const skipEmail = url.searchParams.get("skip_email") === "1";
  const forceEmail = url.searchParams.get("force_email") === "1";
  const runAt = new Date().toISOString();
  const appRoot = findAppRoot();

  const discoveredMap = new Map<string, DiscoveredRoute>();
  for (const dir of GATED_DIRECTORIES) {
    for (const rel of walkRouteFiles(appRoot, dir)) {
      if (discoveredMap.has(rel)) continue;
      const abs = path.join(appRoot, rel);
      discoveredMap.set(rel, {
        route: rel,
        exists: true,
        hasMutation: detectMutation(abs),
      });
    }
  }

  // Manifest may reference files outside GATED_DIRECTORIES (e.g. a route we
  // gated by hand). Stat those individually so we still catch phantom rows.
  for (const entry of FEATURE_GATES) {
    if (discoveredMap.has(entry.route)) continue;
    const abs = path.join(appRoot, entry.route);
    let exists = false;
    let hasMutation = false;
    try {
      if (statSync(abs).isFile()) {
        exists = true;
        hasMutation = detectMutation(abs);
      }
    } catch {
      // exists stays false
    }
    discoveredMap.set(entry.route, { route: entry.route, exists, hasMutation });
  }

  const discovered = [...discoveredMap.values()];
  const drift = detectManifestDrift(discovered, FEATURE_GATES);

  let emailed = false;
  const shouldEmail = (!drift.ok || forceEmail) && !skipEmail;
  if (shouldEmail) {
    const email = formatManifestDriftEmail(drift, runAt);
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: email.subject,
        html: email.html,
      });
      emailed = true;
    } catch (e) {
      console.error("[reseller-manifest-drift] alert email failed", e);
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: runAt,
    drift,
    emailed,
    skip_email: skipEmail,
    force_email: forceEmail,
  });
}

export { GET as POST };
