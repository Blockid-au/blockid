import { describe, expect, it } from "vitest";
import {
  detectManifestDrift,
  formatManifestDriftEmail,
  type DiscoveredRoute,
  type ManifestEntry,
} from "./manifest-drift";

const disc = (
  route: string,
  overrides: Partial<DiscoveredRoute> = {},
): DiscoveredRoute => ({
  route,
  exists: true,
  hasMutation: true,
  ...overrides,
});

const gate = (route: string, feature = "share_management"): ManifestEntry => ({
  route,
  required_feature: feature,
});

describe("detectManifestDrift", () => {
  it("returns ok when every mutation route has a manifest entry and vice versa", () => {
    const result = detectManifestDrift(
      [disc("api/cap-table/route.ts"), disc("api/vesting/route.ts")],
      [gate("api/cap-table/route.ts"), gate("api/vesting/route.ts", "vesting.write")],
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.phantom_missing_file).toEqual([]);
    expect(result.phantom_no_mutation).toEqual([]);
    expect(result.scanned_route_count).toBe(2);
    expect(result.manifest_entry_count).toBe(2);
  });

  it("flags a mutation route on disk with no manifest entry as missing", () => {
    const result = detectManifestDrift(
      [disc("api/cap-table/route.ts"), disc("api/cap-table/rogue/route.ts")],
      [gate("api/cap-table/route.ts")],
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["api/cap-table/rogue/route.ts"]);
    expect(result.phantom_missing_file).toEqual([]);
    expect(result.phantom_no_mutation).toEqual([]);
  });

  it("flags a manifest entry pointing at a deleted file", () => {
    const result = detectManifestDrift(
      [disc("api/cap-table/route.ts")],
      [
        gate("api/cap-table/route.ts"),
        gate("api/cap-table/deleted/route.ts"),
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.phantom_missing_file).toEqual(["api/cap-table/deleted/route.ts"]);
  });

  it("flags a manifest entry whose file exists but only exports read-only handlers", () => {
    const result = detectManifestDrift(
      [
        disc("api/cap-table/route.ts"),
        disc("api/cap-table/readonly/route.ts", { hasMutation: false }),
      ],
      [
        gate("api/cap-table/route.ts"),
        gate("api/cap-table/readonly/route.ts"),
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.phantom_no_mutation).toEqual(["api/cap-table/readonly/route.ts"]);
  });

  it("does not flag read-only routes as missing", () => {
    // Read-only routes are gated at the data-access layer, not the manifest.
    const result = detectManifestDrift(
      [
        disc("api/cap-table/route.ts"),
        disc("api/cap-table/read/route.ts", { hasMutation: false }),
      ],
      [gate("api/cap-table/route.ts")],
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("sorts every drift list alphabetically", () => {
    const result = detectManifestDrift(
      [
        disc("api/z/route.ts"),
        disc("api/a/route.ts"),
        disc("api/m/route.ts"),
      ],
      [],
    );
    expect(result.missing).toEqual([
      "api/a/route.ts",
      "api/m/route.ts",
      "api/z/route.ts",
    ]);
  });

  it("counts an entry with exists=false as phantom_missing_file, not phantom_no_mutation", () => {
    const result = detectManifestDrift(
      [disc("api/gone/route.ts", { exists: false, hasMutation: false })],
      [gate("api/gone/route.ts")],
    );
    expect(result.phantom_missing_file).toEqual(["api/gone/route.ts"]);
    expect(result.phantom_no_mutation).toEqual([]);
  });
});

describe("formatManifestDriftEmail", () => {
  it("uses a clean subject when drift.ok is true", () => {
    const email = formatManifestDriftEmail(
      detectManifestDrift([disc("api/x/route.ts")], [gate("api/x/route.ts")]),
      "2026-07-24T00:00:00Z",
    );
    expect(email.subject).toBe("[BlockID] Feature-gate manifest clean");
    expect(email.text).toContain("Scanned 1 route(s) vs 1 manifest");
  });

  it("counts every drift row in the subject line", () => {
    const drift = detectManifestDrift(
      [
        disc("api/new/route.ts"),
        disc("api/cap-table/route.ts"),
        disc("api/readonly/route.ts", { hasMutation: false }),
      ],
      [
        gate("api/cap-table/route.ts"),
        gate("api/gone/route.ts"),
        gate("api/readonly/route.ts"),
      ],
    );
    const email = formatManifestDriftEmail(drift, "2026-07-24T00:00:00Z");
    expect(email.subject).toBe(
      "[BlockID] Feature-gate manifest drift — 3 findings",
    );
    expect(email.text).toContain("api/new/route.ts");
    expect(email.text).toContain("api/gone/route.ts");
    expect(email.text).toContain("api/readonly/route.ts");
  });

  it("singular 'finding' when total is 1", () => {
    const drift = detectManifestDrift([disc("api/new/route.ts")], []);
    const email = formatManifestDriftEmail(drift, "2026-07-24T00:00:00Z");
    expect(email.subject).toBe(
      "[BlockID] Feature-gate manifest drift — 1 finding",
    );
  });

  it("escapes HTML in route paths", () => {
    // Route paths never contain HTML in practice, but the helper must not
    // leak a stray `<script>` from a manifest edit into an outgoing email.
    const drift = detectManifestDrift(
      [],
      [gate("api/<script>/route.ts")],
    );
    const email = formatManifestDriftEmail(drift, "2026-07-24T00:00:00Z");
    expect(email.html).toContain("api/&lt;script&gt;/route.ts");
    expect(email.html).not.toContain("<script>/route.ts");
  });
});
