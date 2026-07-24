// Pure helpers for the R-09 nightly feature-gate manifest-drift check.
// Per docs/plans/reseller-module-plan.md § U.15.12 (R-09) — the vitest
// completeness test at feature-gates.manifest.test.ts catches drift at CI
// time; this lib powers the runtime cron that catches drift merged past CI
// (e.g. hand edits on the server) and emails admin@blockid.au before an
// ungated mutation route ships another release cycle.
//
// Kept dependency-free so the drift-report shape and alert body can be
// unit tested without touching the filesystem. The cron route at
// /api/cron/reseller-manifest-drift owns the fs walk + regex detection and
// hands the results here.

export interface ManifestEntry {
  route: string;
  required_feature: string;
}

/**
 * A route.ts discovered on disk under one of GATED_DIRECTORIES. `exists`
 * separates "manifest lists a route that used to be here" from "manifest lists
 * a route that never existed" — both are drift, but the second is a sharper
 * signal (e.g. someone edited the manifest by hand).
 */
export interface DiscoveredRoute {
  /** Route path relative to web/src/app, forward-slash normalised. */
  route: string;
  exists: boolean;
  hasMutation: boolean;
}

export interface ManifestDrift {
  /** Discovered mutation routes with no manifest entry. */
  missing: string[];
  /** Manifest entries whose file no longer exists. */
  phantom_missing_file: string[];
  /** Manifest entries whose file exists but exports no mutation handler. */
  phantom_no_mutation: string[];
  /** True when every list is empty. */
  ok: boolean;
  scanned_route_count: number;
  manifest_entry_count: number;
}

export function detectManifestDrift(
  discovered: readonly DiscoveredRoute[],
  manifest: readonly ManifestEntry[],
): ManifestDrift {
  const manifestSet = new Set(manifest.map((m) => m.route));
  const discoveredMap = new Map<string, DiscoveredRoute>();
  for (const row of discovered) {
    discoveredMap.set(row.route, row);
  }

  const missing = discovered
    .filter((row) => row.exists && row.hasMutation && !manifestSet.has(row.route))
    .map((row) => row.route)
    .sort();

  const phantomMissingFile: string[] = [];
  const phantomNoMutation: string[] = [];
  for (const entry of manifest) {
    const disc = discoveredMap.get(entry.route);
    if (!disc || !disc.exists) {
      phantomMissingFile.push(entry.route);
      continue;
    }
    if (!disc.hasMutation) {
      phantomNoMutation.push(entry.route);
    }
  }
  phantomMissingFile.sort();
  phantomNoMutation.sort();

  return {
    missing,
    phantom_missing_file: phantomMissingFile,
    phantom_no_mutation: phantomNoMutation,
    ok:
      missing.length === 0 &&
      phantomMissingFile.length === 0 &&
      phantomNoMutation.length === 0,
    scanned_route_count: discovered.length,
    manifest_entry_count: manifest.length,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(routes: readonly string[]): string {
  if (routes.length === 0) return "  (none)";
  return routes.map((r) => `  - ${r}`).join("\n");
}

function renderHtmlList(routes: readonly string[]): string {
  if (routes.length === 0) return "<li><em>(none)</em></li>";
  return routes.map((r) => `<li><code>${escapeHtml(r)}</code></li>`).join("");
}

export interface DriftEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Formats a drift-alert email. Caller is responsible for only sending when
 * `drift.ok === false` — the helper renders even a clean report so callers
 * can log a dry-run body if they need one.
 */
export function formatManifestDriftEmail(
  drift: ManifestDrift,
  runAt: string,
): DriftEmail {
  const total =
    drift.missing.length +
    drift.phantom_missing_file.length +
    drift.phantom_no_mutation.length;
  const subject = drift.ok
    ? "[BlockID] Feature-gate manifest clean"
    : `[BlockID] Feature-gate manifest drift — ${total} finding${total === 1 ? "" : "s"}`;

  const text = [
    `Feature-gate manifest drift report`,
    `Ran: ${runAt}`,
    `Scanned ${drift.scanned_route_count} route(s) vs ${drift.manifest_entry_count} manifest entr(y|ies).`,
    ``,
    `Missing (mutation route on disk with no manifest entry):`,
    renderList(drift.missing),
    ``,
    `Phantom — file missing (manifest entry with no file):`,
    renderList(drift.phantom_missing_file),
    ``,
    `Phantom — no mutation (manifest entry whose file exports no POST/PATCH/PUT/DELETE):`,
    renderList(drift.phantom_no_mutation),
    ``,
    `Fix: edit web/src/lib/feature-gates.manifest.ts and rerun`,
    `\`npm run lint:reseller\` + the manifest-completeness vitest suite.`,
  ].join("\n");

  const html = [
    `<p><strong>Feature-gate manifest drift report</strong></p>`,
    `<p>Ran: <code>${escapeHtml(runAt)}</code><br/>`,
    `Scanned ${drift.scanned_route_count} route(s) vs ${drift.manifest_entry_count} manifest entr(y|ies).</p>`,
    `<p><strong>Missing</strong> — mutation route on disk with no manifest entry:</p>`,
    `<ul>${renderHtmlList(drift.missing)}</ul>`,
    `<p><strong>Phantom — file missing</strong>:</p>`,
    `<ul>${renderHtmlList(drift.phantom_missing_file)}</ul>`,
    `<p><strong>Phantom — no mutation</strong>:</p>`,
    `<ul>${renderHtmlList(drift.phantom_no_mutation)}</ul>`,
    `<p>Fix: edit <code>web/src/lib/feature-gates.manifest.ts</code> and rerun `,
    `<code>npm run lint:reseller</code> + the manifest-completeness vitest suite.</p>`,
  ].join("\n");

  return { subject, html, text };
}
